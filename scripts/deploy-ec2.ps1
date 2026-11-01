# Deploy AgentSpace on a Single EC2 Instance (t3.micro Free Tier) with K3s and Permanent Elastic IP
param(
    [string]$Region = "ap-south-1",
    [string]$InstanceType = "t3.micro",
    [string]$BucketName = "agentspace-812682262509-ap-south-1",
    [string]$KeyName = "agentspace-key"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "AgentSpace Permanent EC2 Deployment (K3s + Elastic IP)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify AWS Identity
Write-Host "`n[1/8] Verifying AWS Identity in $Region..." -ForegroundColor Yellow
$identityJson = aws sts get-caller-identity --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] AWS CLI authentication failed. Please run 'aws configure'." -ForegroundColor Red
    exit 1
}
$identity = $identityJson | ConvertFrom-Json
Write-Host "[OK] Authenticated as: $($identity.Arn)" -ForegroundColor Green
Write-Host "[OK] AWS Account ID:    $($identity.Account)" -ForegroundColor Green

# 2. Ensure S3 Bucket Exists for Sandbox Workspaces & Deployment
Write-Host "`n[2/8] Ensuring S3 Bucket '$BucketName' exists..." -ForegroundColor Yellow
$s3Check = aws s3 ls "s3://$BucketName" --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating S3 bucket $BucketName in $Region..." -ForegroundColor Yellow
    aws s3 mb "s3://$BucketName" --region $Region
    if ($LASTEXITCODE -ne 0) {
        aws s3api create-bucket --bucket $BucketName --region $Region --create-bucket-configuration LocationConstraint=$Region | Out-Null
    }
    Write-Host "[OK] S3 Bucket ready: $BucketName" -ForegroundColor Green
} else {
    Write-Host "[OK] S3 Bucket already exists: $BucketName" -ForegroundColor Green
}

# 3. Package & Upload Application Code to S3
Write-Host "`n[3/8] Packaging application code (excluding node_modules, .git, dist)..." -ForegroundColor Yellow
$archiveName = "agentspace-deploy.tar.gz"
if (Test-Path $archiveName) { Remove-Item -Force $archiveName }

tar -czf $archiveName --exclude="node_modules" --exclude=".git" --exclude="dist" --exclude="*.tar.gz" .
$archiveSize = (Get-Item $archiveName).Length / 1KB
Write-Host ("Archive created: {0:N1} KB" -f $archiveSize) -ForegroundColor Green

Write-Host "Uploading archive to s3://$BucketName/deploy/$archiveName..." -ForegroundColor Yellow
aws s3 cp $archiveName "s3://$BucketName/deploy/$archiveName" --region $Region | Out-Null
Remove-Item -Force $archiveName

Write-Host "Generating temporary pre-signed URL for EC2 bootstrapping..." -ForegroundColor Yellow
$presignedUrl = (aws s3 presign "s3://$BucketName/deploy/$archiveName" --expires-in 10800 --region $Region).Trim()
Write-Host "[OK] Deployment artifact ready in S3." -ForegroundColor Green

# 4. Get Default VPC & Subnet (ensuring AZ supports t3.medium: ap-south-1a or ap-south-1b)
Write-Host "`n[4/8] Querying VPC and Subnet..." -ForegroundColor Yellow
$vpcs = aws ec2 describe-vpcs --region $Region --filters "Name=isDefault,Values=true" | ConvertFrom-Json
if (-not $vpcs.Vpcs -or $vpcs.Vpcs.Count -eq 0) {
    $vpcs = aws ec2 describe-vpcs --region $Region | ConvertFrom-Json
}
$vpcId = $vpcs.Vpcs[0].VpcId
Write-Host "[OK] Using VPC: $vpcId" -ForegroundColor Green

# Filter subnets in ap-south-1a or 1b (ap-south-1c does not support t3 instances)
$subnets = aws ec2 describe-subnets --region $Region --filters "Name=vpc-id,Values=$vpcId" "Name=availability-zone,Values=ap-south-1a,ap-south-1b" 2>$null | ConvertFrom-Json
if ($subnets.Subnets -and $subnets.Subnets.Count -gt 0) {
    $subnet = $subnets.Subnets[0]
    $subnetId = $subnet.SubnetId
    Write-Host "[OK] Using Subnet: $subnetId (AZ: $($subnet.AvailabilityZone))" -ForegroundColor Green
} else {
    $allSubnets = aws ec2 describe-subnets --region $Region --filters "Name=vpc-id,Values=$vpcId" | ConvertFrom-Json
    $subnetId = $allSubnets.Subnets[0].SubnetId
    Write-Host "[OK] Using Subnet: $subnetId" -ForegroundColor Green
}

# 5. Create or Reuse SSH Key Pair & Security Group
Write-Host "`n[5/8] Setting up SSH Key Pair and Security Group..." -ForegroundColor Yellow
$keyPairs = aws ec2 describe-key-pairs --region $Region --filters "Name=key-name,Values=$KeyName" 2>$null | ConvertFrom-Json
if (-not $keyPairs.KeyPairs -or $keyPairs.KeyPairs.Count -eq 0) {
    Write-Host "Creating SSH Key Pair '$KeyName'..." -ForegroundColor Yellow
    $keyData = aws ec2 create-key-pair --region $Region --key-name $KeyName --query "KeyMaterial" --output text
    $keyData | Out-File -FilePath "$KeyName.pem" -Encoding ascii
    Write-Host "[OK] SSH private key saved to: $KeyName.pem" -ForegroundColor Green
} else {
    Write-Host "[OK] Reusing existing Key Pair: $KeyName" -ForegroundColor Green
}

$sgName = "agentspace-ec2-sg"
$existingSg = aws ec2 describe-security-groups --region $Region --filters "Name=group-name,Values=$sgName" "Name=vpc-id,Values=$vpcId" 2>$null | ConvertFrom-Json

if ($existingSg.SecurityGroups -and $existingSg.SecurityGroups.Count -gt 0) {
    $sgId = $existingSg.SecurityGroups[0].GroupId
    Write-Host "[OK] Found existing Security Group: $sgId" -ForegroundColor Green
} else {
    $newSg = aws ec2 create-security-group --region $Region --group-name $sgName --description "Security group for AgentSpace K3s server" --vpc-id $vpcId | ConvertFrom-Json
    $sgId = $newSg.GroupId
    Write-Host "[OK] Created Security Group: $sgId" -ForegroundColor Green
    
    # Authorize inbound ports 22, 80, 443
    aws ec2 authorize-security-group-ingress --region $Region --group-id $sgId --protocol tcp --port 22 --cidr 0.0.0.0/0 | Out-Null
    aws ec2 authorize-security-group-ingress --region $Region --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 | Out-Null
    aws ec2 authorize-security-group-ingress --region $Region --group-id $sgId --protocol tcp --port 443 --cidr 0.0.0.0/0 | Out-Null
    Write-Host "[OK] Inbound ports 22, 80, 443 authorized." -ForegroundColor Green
}

# 6. Allocate or Reuse Permanent Elastic IP
Write-Host "`n[6/8] Allocating Permanent Elastic IP (Static Public IP)..." -ForegroundColor Yellow
$eips = aws ec2 describe-addresses --region $Region --filters "Name=tag:Name,Values=agentspace-eip" 2>$null | ConvertFrom-Json

if ($eips.Addresses -and $eips.Addresses.Count -gt 0) {
    $eip = $eips.Addresses[0]
    $allocationId = $eip.AllocationId
    $publicIp = $eip.PublicIp
    Write-Host "[OK] Reusing existing Elastic IP: $publicIp (Allocation ID: $allocationId)" -ForegroundColor Green
} else {
    $newEip = aws ec2 allocate-address --region $Region --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=agentspace-eip}]" | ConvertFrom-Json
    $allocationId = $newEip.AllocationId
    $publicIp = $newEip.PublicIp
    Write-Host "[OK] Allocated NEW Permanent Elastic IP: $publicIp" -ForegroundColor Green
}

$permanentDomain = "agentspace.$publicIp.nip.io"
Write-Host "Primary URL:       http://$permanentDomain" -ForegroundColor Cyan
Write-Host "Wildcard Previews: http://*.preview.$permanentDomain" -ForegroundColor Cyan

# 7. Get Ubuntu 24.04 LTS AMI
Write-Host "`n[7/8] Locating latest Ubuntu 24.04 LTS AMI..." -ForegroundColor Yellow
$amiId = (aws ec2 describe-images --region $Region --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" --query "reverse(sort_by(Images, &CreationDate))[0].ImageId" --output text).Trim()
Write-Host "[OK] AMI ID: $amiId" -ForegroundColor Green

# 8. Generate UserData and Launch EC2 Instance
Write-Host "`n[8/8] Generating UserData bootstrap and launching EC2 Instance ($InstanceType)..." -ForegroundColor Yellow

$userData = @"
#!/bin/bash
set -e
exec > >(tee -a /var/log/agentspace-deploy.log) 2>&1

echo "=========================================================="
echo "AgentSpace Automated Cloud Deployment Bootstrap"
echo "Public IP: $publicIp"
echo "Domain:    $permanentDomain"
echo "=========================================================="

# 1. 6GB Swap Space (Gives 1GB RAM + 6GB Swap = 7GB Virtual Memory)
echo "=== [1/7] Creating 6GB Swap file ==="
if [ ! -f /swapfile ]; then
    fallocate -l 6G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=6144
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=60
fi

# 2. Packages
echo "=== [2/7] Installing prerequisite packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl apt-transport-https ca-certificates gnupg lsb-release tar sed

# 3. Docker
echo "=== [3/7] Installing Docker ==="
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sh /tmp/get-docker.sh
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker

# 4. K3s with Docker runtime
echo "=== [4/7] Installing K3s with Docker runtime ==="
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker --tls-san $publicIp" sh -

echo "Waiting for K3s node to be ready..."
while ! k3s kubectl get node | grep -q " Ready"; do
  sleep 3
done
echo "K3s is Ready!"

mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube
chmod 600 /home/ubuntu/.kube/config
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# 5. Download code archive
echo "=== [5/7] Downloading application package ==="
mkdir -p /home/ubuntu/agentSpace
curl -fsSL "$presignedUrl" -o /tmp/agentspace.tar.gz
tar -xzf /tmp/agentspace.tar.gz -C /home/ubuntu/agentSpace
chown -R ubuntu:ubuntu /home/ubuntu/agentSpace
cd /home/ubuntu/agentSpace

# 6. Build Docker images
echo "=== [6/7] Building local Docker images ==="
docker build -t frontend:latest ./frontend
docker build -t auth:latest ./auth
docker build -t sandbox:latest ./sandbox/server
docker build -t router:latest ./sandbox/router
docker build -t agent:latest ./sandbox/agent
docker build -t sync-agent:latest ./sandbox/sync-agent
docker build -t template:latest ./sandbox/template
docker build -t ai-orchestration:latest ./ai-orchestration
docker build -t notification:latest ./notification

# 7. Apply Kubernetes manifests
echo "=== [7/7] Applying Kubernetes manifests ==="
sed -i "s|agentspace\.54\.255\.113\.123\.nip\.io|$permanentDomain|g" k8s/frontend-deployment.yml
sed -i "s|agentspace\.54\.255\.113\.123\.nip\.io|$permanentDomain|g" k8s/sandbox-deployment.yml
sed -i "s|preview\.agentspace\.54\.255\.113\.123\.nip\.io|preview.$permanentDomain|g" k8s/sandbox-deployment.yml
sed -i "s|__DOMAIN__|$permanentDomain|g" k8s/ingress-k3s.yml

k3s kubectl apply -f k8s/rbac.yml
k3s kubectl apply -f k8s/secrets.yml
k3s kubectl apply -f k8s/ai-service.yml -f k8s/ai-deployment.yml
k3s kubectl apply -f k8s/auth-service.yml -f k8s/auth-deployment.yml
k3s kubectl apply -f k8s/notification-service.yml -f k8s/notification-deployment.yml
k3s kubectl apply -f k8s/router-service.yml -f k8s/router-deployment.yml
k3s kubectl apply -f k8s/sandbox-service.yml -f k8s/sandbox-deployment.yml
k3s kubectl apply -f k8s/frontend-service.yml -f k8s/frontend-deployment.yml
k3s kubectl apply -f k8s/ingress-k3s.yml

echo "=========================================================="
echo "AgentSpace Deployment Bootstrap Successfully Finished!"
echo "Primary Live URL: http://$permanentDomain"
echo "=========================================================="
"@

$userDataFile = Join-Path $PSScriptRoot "userdata.sh"
[System.IO.File]::WriteAllText($userDataFile, $userData, (New-Object System.Text.UTF8Encoding($false)))
$userDataPath = (Resolve-Path $userDataFile).Path.Replace('\', '/')

Write-Host "Invoking EC2 run-instances..." -ForegroundColor Yellow

$instanceId = (aws ec2 run-instances `
    --region $Region `
    --image-id $amiId `
    --count 1 `
    --instance-type $InstanceType `
    --key-name $KeyName `
    --security-group-ids $sgId `
    --subnet-id $subnetId `
    --user-data "file://$userDataPath" `
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true}" `
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=agentspace-server}]" `
    --query "Instances[0].InstanceId" `
    --output text).Trim()

if (Test-Path $userDataFile) { Remove-Item -Force $userDataFile }

if (-not $instanceId -or $LASTEXITCODE -ne 0 -or $instanceId.StartsWith("None")) {
    Write-Host "[ERROR] EC2 launch failed. Check output above." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Launched Instance: $instanceId" -ForegroundColor Green

Write-Host "Waiting for instance to enter running state..." -ForegroundColor Yellow
aws ec2 wait instance-running --region $Region --instance-ids $instanceId
Write-Host "[OK] Instance is running!" -ForegroundColor Green

# Associate Elastic IP
Write-Host "`nAssociating Elastic IP $publicIp with $instanceId..." -ForegroundColor Yellow
aws ec2 associate-address --region $Region --instance-id $instanceId --allocation-id $allocationId | Out-Null
Write-Host "[OK] Permanent Elastic IP $publicIp successfully attached!" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "Deployment Successfully Triggered!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Instance ID:        $instanceId" -ForegroundColor Cyan
Write-Host "Permanent IP:       $publicIp" -ForegroundColor Cyan
Write-Host "Primary Live URL:   http://$permanentDomain" -ForegroundColor Cyan
Write-Host "Preview Wildcard:   http://*.preview.$permanentDomain" -ForegroundColor Cyan
Write-Host "SSH Command:        ssh -i $KeyName.pem ubuntu@$publicIp" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "`nServer bootstrap and image building takes ~5-8 minutes in the background. After that, your URL will be live!" -ForegroundColor Magenta

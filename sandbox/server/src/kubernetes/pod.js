import { k8sCoreV1Api } from "./config.js";

//ye pods ki configuration hai jo sandbox ke liye create ki ja rahi hai. Ye pod containers ko run karega: "sandbox-container", "agent-container", aur agar projectId provided hai toh "sync-agent-container". Init container ka kaam hai workspace ke files ko seed directory me copy karna. Ye pod ek emptyDir volume ka use karta hai jisse containers ke beech data share kiya ja sake.
export async function createPod(sandboxId, projectId) {

    const isProduction = process.env.NODE_ENV === 'production';
    const previewDomain = process.env.PREVIEW_DOMAIN || (isProduction ? 'preview.cryboy.in' : 'preview.localhost:8080');
    const configuredPreviewPort = new URL(`http://${previewDomain}`).port;
    const hmrClientPort = configuredPreviewPort || (isProduction ? '443' : '8080');

    const containers = [
        {
            image: "688928000248.dkr.ecr.ap-southeast-1.amazonaws.com/template",
            imagePullPolicy: "IfNotPresent",
            name: 'sandbox-container',
            ports: [ { containerPort: 5173, name: "http" } ],
            env: [
                { name: 'VITE_HMR_CLIENT_PORT', value: hmrClientPort }
            ],
            resources: {
                limits: { cpu: "500m", memory: "1Gi" },
                requests: { cpu: "250m", memory: "500Mi" }
            },
            volumeMounts: [
                {
                    name: 'workspace-volume',
                    mountPath: '/workspace'
                }
            ]
        },
        {
            image: "688928000248.dkr.ecr.ap-southeast-1.amazonaws.com/agent",
            imagePullPolicy: "IfNotPresent",
            name: 'agent-container',
            ports: [ { containerPort: 3000, name: "http" } ],
            resources: {
                limits: { cpu: "500m", memory: "1Gi" },
                requests: { cpu: "250m", memory: "500Mi" }
            },
            volumeMounts: [
                {
                    name: 'workspace-volume',
                    mountPath: '/workspace'
                }
            ]
        }
    ];

    // S3 synchronization is optional for local development. Starting a sync
    // container with empty AWS credentials causes it to exit immediately,
    // which leaves the whole sandbox Pod NotReady and breaks preview/files/terminal.
    const hasAwsCredentials = Boolean(
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    );
    if (projectId && hasAwsCredentials) {
        containers.push({
            image: "688928000248.dkr.ecr.ap-southeast-1.amazonaws.com/sync-agent",
            imagePullPolicy: "IfNotPresent",
            name: 'sync-agent-container',
            env: [
                { name: "PROJECT_ID", value: String(projectId) },
                { name: "AWS_REGION", value: process.env.AWS_REGION || "ap-southeast-1" },
                { name: "AWS_ACCESS_KEY_ID", value: process.env.AWS_ACCESS_KEY_ID || "" },
                { name: "AWS_SECRET_ACCESS_KEY", value: process.env.AWS_SECRET_ACCESS_KEY || "" },
                { name: "BUCKET_NAME", value: process.env.BUCKET_NAME || "agentspace-688928000248-ap-south-1-an" }
            ],
            volumeMounts: [
                {
                    name: 'workspace-volume',
                    mountPath: '/workspace'
                }
            ]
        });
    }

    const podManifest = {
        metadata: {
            name: `sandbox-pod-${sandboxId}`,
            labels: {
                app: 'sandbox',
                sandboxId: sandboxId
            }
        },
        spec: {
            volumes: [
                {
                    name: 'workspace-volume',
                    emptyDir: {}
                }
            ],
            initContainers: [
                {
                    name: "init-container",
                    image: "688928000248.dkr.ecr.ap-southeast-1.amazonaws.com/template",
                    imagePullPolicy: "IfNotPresent",
                    command: ["sh", "-c", "cp -r /workspace/. /seed/"],
                    volumeMounts: [
                        {
                            name: 'workspace-volume',
                            mountPath: '/seed'
                        }
                    ]

                }
            ],
            containers
        }
    };

    const response = await k8sCoreV1Api.createNamespacedPod({
        namespace: 'default',
        body: podManifest
    });

    return response;
}

export async function deletePod(sandboxId) {
    try {
        const response = await k8sCoreV1Api.deleteNamespacedPod({
            name: `sandbox-pod-${sandboxId}`,
            namespace: 'default'
        });
        return response;
    } catch (err) {
        if (err.statusCode === 404 || err.response?.statusCode === 404) {
            return null;
        }
        console.error(`Error deleting pod sandbox-pod-${sandboxId}:`, err);
        throw err;
    }
}

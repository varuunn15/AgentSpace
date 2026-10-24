import { k8sCoreV1Api } from "./config.js";
//ye service ki configuration hai jo sandbox ke liye create ki ja rahi hai. Ye service do ports ko expose karegi: ek 80 port jo "sandbox-container" ke 5173 port ko map karega aur ek 3000 port jo "agent-container" ke 3000 port ko map karega. Ye service ek ClusterIP type ki service hai jo internal communication ke liye use hoti hai.
export const createService = async (sandboxId) => {
    const serviceManifest = {
        metadata: {
            name: `sandbox-service-${sandboxId}`,
            labels: {
                sandboxId: sandboxId
            }
        },
        spec: {
            // A sandbox can still serve preview and terminal traffic when its
            // optional S3 sync sidecar is unavailable. Route to the live app
            // containers while Kubernetes reports the Pod as partially ready.
            publishNotReadyAddresses: true,
            selector: {
                sandboxId: sandboxId
            },
            ports: [
                {
                    name: "http",
                    port: 80,
                    targetPort: 5173,
                    protocol: "TCP"
                },
                {
                    name: "agent-http",
                    port: 3000,
                    targetPort: 3000,
                    protocol: "TCP"
                }
            ],
            type: "ClusterIP"
        }
    };

    const response = await k8sCoreV1Api.createNamespacedService({
        namespace: 'default',
        body: serviceManifest
    });

    return response;
};

export async function deleteService(sandboxId) {
    try {
        const response = await k8sCoreV1Api.deleteNamespacedService({
            name: `sandbox-service-${sandboxId}`,
            namespace: 'default'
        });
        return response;
    } catch (err) {
        if (err.statusCode === 404 || err.response?.statusCode === 404) {
            return null;
        }
        console.error(`Error deleting service sandbox-service-${sandboxId}:`, err);
        throw err;
    }
}

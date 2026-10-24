//iski bajah se hum hmare pods create kr payenge or jo service h wo bhi create kr payenge
import * as K8sApi from '@kubernetes/client-node';

const kc = new K8sApi.KubeConfig();
kc.loadFromDefault();

export const k8sCoreV1Api = kc.makeApiClient(K8sApi.CoreV1Api);
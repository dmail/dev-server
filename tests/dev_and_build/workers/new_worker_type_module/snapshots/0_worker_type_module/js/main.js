const testWorker = async (worker) => {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      resolve(e.data);
    };
    worker.onerror = (e) => {
      reject(e.message);
    };
    worker.postMessage("ping");
  });
};

const worker = new Worker("/worker.nomodule.js", { type: "classic" });
const workerResponse = await testWorker(worker);

const worker2 = new Worker(new URL("/worker.nomodule.js", import.meta.url), {
  type: "classic",
});
const worker2Response = await testWorker(worker2);

window.resolveResultPromise({
  workerResponse,
  worker2Response,
});

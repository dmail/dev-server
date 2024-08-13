import { exec as nodeExec } from "node:child_process";

export const exec = (
  command,
  { cwd, onLog = () => {}, onErrorLog = () => {} } = {},
) => {
  return new Promise((resolve, reject) => {
    const commandProcess = nodeExec(
      command,
      {
        cwd,
        stdio: "silent",
      },
      (error, out) => {
        if (error) {
          reject(error);
        } else {
          resolve(out);
        }
      },
    );

    commandProcess.stdout.on("data", (data) => {
      onLog(data);
    });
    commandProcess.stderr.on("data", (data) => {
      // debug because this output is part of
      // the error message generated by a failing npm publish
      onErrorLog(data);
    });
  });
};

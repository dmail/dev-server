/* globals true, false */

window.resolveResultPromise({
  dev: true,
  build: false,
});

// eslint-disable-next-line no-new
new Worker(new URL("/worker.js", window.location));

window.navigator.serviceWorker.register("/sw.js");

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vVXNlcnMvZGFtL0RvY3VtZW50cy9kZXYvY29yZS90ZXN0cy9kZXZfYW5kX2J1aWxkL2dsb2JhbF9zY2VuYXJpby9jbGllbnQvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFHLENBQUYsQUFBRyxDQUFGLEFBQUcsQ0FBRixDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQU8sQ0FBTixBQUFPLENBQU4sQUFBTyxDQUFOLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOztBQUUvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFHLENBQUYsQ0FBQyxDQUFDO0FBQ2QsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQUksQ0FBSCxDQUFDLENBQUMsQ0FBQztBQUNsQixDQUFDLENBQUM7O0FBRUYsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUEsQUFBQzs7QUFFbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGdsb2JhbHMgX19ERVZfXywgX19CVUlMRF9fICovXG5cbndpbmRvdy5yZXNvbHZlUmVzdWx0UHJvbWlzZSh7XG4gIGRldjogX19ERVZfXyxcbiAgYnVpbGQ6IF9fQlVJTERfXyxcbn0pO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tbmV3XG5uZXcgV29ya2VyKG5ldyBVUkwoXCIuL3dvcmtlci5qc1wiLCB3aW5kb3cubG9jYXRpb24pKTtcblxud2luZG93Lm5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlZ2lzdGVyKFwiL3N3LmpzXCIpO1xuIl19

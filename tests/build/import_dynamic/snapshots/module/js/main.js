export const loadFeature = async () => {
  const { answer, loadNestedFeature } = await import("/js/feature.js");
  loadNestedFeature();
  // eslint-disable-next-line no-debugger
  debugger;
  console.log(answer);
};

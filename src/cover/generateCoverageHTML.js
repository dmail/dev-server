import { Collector, Reporter } from "istanbul"

export const generateCoverageHTML = (coverageMap) => {
  const collector = new Collector()
  collector.add(coverageMap)
  const reporter = new Reporter()
  reporter.add("html")
  reporter.write(collector, false, () => {})
}

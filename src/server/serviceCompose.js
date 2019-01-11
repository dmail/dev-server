import { asyncFunctionCandidatesToElectedValuePromise } from "@dmail/helper"

const serviceGeneratedResponsePredicate = (value) => {
  if (value === null) {
    return false
  }
  return typeof value === "object"
}

export const serviceCompose = (...callbacks) => {
  return (request) => {
    return asyncFunctionCandidatesToElectedValuePromise(
      callbacks,
      request,
      serviceGeneratedResponsePredicate,
    )
  }
}

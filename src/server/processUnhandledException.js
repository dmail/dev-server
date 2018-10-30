import { createSignal, someAsyncListenerResolvesWith } from "@dmail/signal"

const exceptionEmitter = () => {
  let resolve
  let reject
  const recoverManualPromise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  const visitor = (param) => {
    const recoverListenerPromise = someAsyncListenerResolvesWith((value) => value === true)(param)
    return Promise.race([recoverManualPromise, recoverListenerPromise])
  }

  return { visitor, resolve, reject }
}

const install = ({ triggerException, recoverWhen }) => {
  const onError = (error) => {
    triggerException({
      value: error,
    })
  }

  const onUnhandledRejection = (value, promise) => {
    triggerException({
      value,
      origin: promise,
    })
  }

  const onRejectionHandled = (promise) => {
    recoverWhen(({ origin }) => origin === promise)
  }

  process.on("unhandledRejection", onUnhandledRejection)
  process.on("rejectionHandled", onRejectionHandled)
  process.on("uncaughtException", onError)

  return () => {
    process.removeListener("unhandledRejection", onUnhandledRejection)
    process.removeListener("rejectionHandled", onRejectionHandled)
    process.removeListener("uncaughtException", onError)
  }
}

export const processUnhandledException = () => {
  const exceptionSignal = createSignal({
    emitter: exceptionEmitter,
    recursed: ({ emitExecution, args }) => {
      console.error(`${args[0].value} error occured while handling ${emitExecution.args[0]}`)
      emitExecution.resolve(false)
    },
    installer: ({ isEmitting, getEmitExecution, emit, disableWhileCalling }) => {
      const triggerException = (exception) => {
        emit(exception).then(
          (recovered) => {
            if (recovered) {
              return
            }
            // removeAllWhileCalling prevent catching of the next throw
            // else the following would create an infinite loop
            // process.on('uncaughtException', function() {
            //     setTimeout(function() {
            //         throw 'yo';
            //     });
            // });
            disableWhileCalling(() => {
              throw exception.value // this mess up the stack trace :'(
            })
          },
          (otherException) => {
            console.error(`${otherException} internal error occured while handling ${exception}`)
            disableWhileCalling(() => {
              throw exception.value
            })
          },
        )
      }

      const recoverWhen = (match) => {
        if (isEmitting()) {
          const emitExecution = getEmitExecution()
          if (match(...emitExecution.getArguments())) {
            emitExecution.resolve(true)
          }
        }
      }

      return install({
        triggerException,
        recoverWhen,
      })
    },
  })

  return (callback) => {
    const listener = exceptionSignal.listen(callback)
    return () => {
      listener.remove()
    }
  }
}

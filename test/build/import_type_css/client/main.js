import sheet from "./src/main.css" assert { type: "css" }

document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]

let resolveNamespace
window.namespace = new Promise((resolve) => {
  resolveNamespace = resolve
})

// on firefox + webkit we have to wait a bit,
// it seems the styles are applied on next js event loop
await new Promise((resolve) => {
  setTimeout(resolve, 200)
})

const bodyBackgroundColor = getComputedStyle(document.body).backgroundColor

console.log({ bodyBackgroundColor })

// let 700ms for the background image to load
await new Promise((resolve) => {
  setTimeout(resolve, 700)
})

const bodyBackgroundImage = getComputedStyle(document.body).backgroundImage

console.log({ bodyBackgroundImage })

resolveNamespace({
  bodyBackgroundColor,
  bodyBackgroundImage,
})

export { bodyBackgroundColor, bodyBackgroundImage }

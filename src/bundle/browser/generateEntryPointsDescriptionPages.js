import { createOperation, createCancellationToken } from "@dmail/cancellation"
import { fileWrite } from "@dmail/helper"

export const generateEntryPointsDescriptionPages = async ({
  cancellationToken = createCancellationToken(),
  projectFolder,
  into,
  entryPointsDescription,
}) => {
  await Promise.all(
    Object.keys(entryPointsDescription).map((entryName) => {
      return generateEntryPage({
        cancellationToken,
        projectFolder,
        into,
        entryName,
      })
    }),
  )
}

const generateEntryPage = async ({ cancellationToken, projectFolder, into, entryName }) => {
  const entryFilenameRelative = `${entryName}.js`
  const pageFilenameRelative = `${entryName}.html`

  const html = `<!doctype html>

<head>
  <title>Untitled</title>
  <meta charset="utf-8" />
</head>

<body>
  <main></main>
  <script src="./${entryFilenameRelative}"></script>
</body>

</html>`

  await createOperation({
    cancellationToken,
    start: () => fileWrite(`${projectFolder}/${into}/${pageFilenameRelative}`, html),
  })
}

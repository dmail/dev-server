import "./global-fetch.js"
import { startTranspileServer } from "./startTranspileServer.js"
import SystemJS from "systemjs"
import path from "path"
import { fromPromise } from "@dmail/action"

// on est pas forcé de démarrer un serveur grâce au truc utilisé dans createSystem
// on pourrait utiliser le compiler directement
// mais pour le browser on aura  pas le choix donc autant utiliser
// le truc le plus puissant et compliqué dès maintenant

startTranspileServer({
	location: `${path.resolve(__dirname, "../../src/__test__")}/`,
}).then(({ url, close }) => {
	const System = new SystemJS.constructor()
	System.config({
		baseURL: String(url),
	})
	const indexLocation = `${url}file.js`
	return fromPromise(System.import(indexLocation)).then((value) => {
		console.log("system js import resolve with", value)
		return close()
	})
})

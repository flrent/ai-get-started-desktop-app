const { Worker } = require('worker_threads');
const { dialog } = require("electron");
const path = require("path");
const fs = require('fs').promises;
const {
	abort,
	run,
	chat,
	stop,
	serve,
} = require("./service/ollama/ollama.js");

let model = "llava";
let loadingDoc = false;

function debugLog(msg) {
	if (global.debug) {
		console.log(msg);
	}
}

async function setModel(event, msg) {
	model = msg;
}

async function getModel(event) {
	event.reply("model:get", { success: true, content: model });
}

async function runOllamaModel(event, msg) {
	try {
		// send an empty message to the model to load it into memory
		await run(model, (json) => {
			// status will be set if the model is downloading
			if (json.status) {
				if (json.status.includes("pulling")) {
					const percent = Math.round((json.completed / json.total) * 100);
					const content = isNaN(percent)
					? "Downloading AI model..."
					: `Downloading AI model... ${percent}%`;
					event.reply("ollama:run", { success: true, content: content });
					return;
				}
				if (json.status.includes("verifying")) {
					const content = `Verifying AI model...`;
					event.reply("ollama:run", { success: true, content: content });
					return;
				}
			}
			if (json.done) {
				event.reply("ollama:run", { success: true, content: json });
				return;
			}
			event.reply("ollama:run", { success: true, content: "Initializing..." });
		});
	} catch (err) {
		console.log(err);
		event.reply("ollama:run", { success: false, content: err.message });
	}
}

async function sendCommand(event, images) {
	let base64 = await convertImageToBase64(images[0]);

	try {
		debugLog("Sending prompt to Ollama...");

		await chat(model, [base64], (json) => {
			// Reply with the content every time we receive data
			event.reply("chat:reply", { success: true, content: json });
		});
	} catch (err) {
		console.log(err);
		event.reply("chat:reply", { success: false, content: err.message });
	}
}

async function stopChat() {
	await abort();
}

async function loadDocument(event) {
	loadingDoc = true;
	try {
		// clearVectorStore();
		const filePath = await selectDocumentFile();
		debugLog(`Loading file: ${filePath}`);
		processDocument(filePath, event);
	} catch (err) {
		handleDocumentLoadError(err, event);
	}
}

async function selectDocumentFile() {
	const options = {
		properties: ["openFile"],
		filters: [{ name: "Text Files", extensions: ["docx", "md", "odt", "pdf", "txt", "html", "htm", "png", "jpg"] }],
	};
	
	const result = await dialog.showOpenDialog(options);
	if (result.canceled || result.filePaths.length === 0) {
		throw new Error("No file selected");
	}
	
	return result.filePaths[0];
}

async function convertImageToBase64(filePath) {
	try {
	  // Check if the file exists
	  await fs.access(filePath); // If the file doesn't exist, an error will be thrown.
  
	  // Read the file into a buffer asynchronously
	  const data = await fs.readFile(filePath);
	  
	  // Convert the buffer to a Base64 string
	  const base64String = data.toString('base64');
  
	  return base64String;
	} catch (err) {
	  console.error('Error:', err);
	  return false;
	}
  }

function processDocument(filePath, event) {
	const worker = new Worker('./src/service/worker.js');
	worker.postMessage(filePath);
	
	worker.on('message', async (e) => {
		if (e.success) {
			debugLog("Storing embeddings...");
			await store(e.embeddings);
			debugLog("Embeddings stored");
			event.reply("doc:load", { success: true, content: path.basename(filePath) });
			loadingDoc = false;
		} else {
			event.reply("doc:load", { success: false, content: e.content });
			loadingDoc = false;
		}
	});
	
	worker.on('error', err => handleDocumentLoadError(err, event));
}

function handleDocumentLoadError(err, event) {
	loadingDoc = false;
	console.log('Error:', err);
	event.reply("doc:load", { success: false, content: err.message });
}

async function serveOllama(event) {
	try {
		const serveType = await serve();
		event.reply("ollama:serve", { success: true, content: serveType });
	} catch (err) {
		event.reply("ollama:serve", { success: false, content: err.message });
	}
}

function stopOllama(event) {
	stop();
}

module.exports = {
	setModel,
	getModel,
	stopChat,
	sendCommand,
	loadDocument,
	serveOllama,
	runOllamaModel,
	stopOllama,
};

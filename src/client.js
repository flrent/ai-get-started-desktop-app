// This script handles interaction with the user interface, as well as communication
// between the renderer thread (UI) and the worker thread (processing).
const initalSpinner = document.getElementById("spinner");
const statusMsg = document.getElementById("status-msg");
const chatView = document.getElementById("chat-view");

let responseElem;

/**
* This is the initial chain of events that must run on start-up.
* 1. Start the Ollama server.
* 2. Run the model. This will load the model into memory so that first chat is not slow.
*    This step will also download the model if it is not already downloaded.
* 3. Monitor the run status
* 4. Load the chat
*/

// 1. Start the Ollama server
window.electronAPI.serveOllama();
// 2. Run the model
window.electronAPI.onOllamaServe((event, data) => {
	if (!data.success) {
		initalSpinner.style.display = "none";
		statusMsg.textContent =
		"Error: " + (data.content || "Unknown error occurred.");
		return;
	}
	if (data.content === "system") {
		// Ollama was already running, and we just connected to it, let the user know
		console.log("Ollama already running");
	}
	window.electronAPI.runOllama();
});
// 3. Monitor the run status
window.electronAPI.onOllamaRun((event, data) => {
	if (!data.success) {
		initalSpinner.style.display = "none";
		statusMsg.textContent = "Error: " + data.content;
		return;
	}
	if (data.content.done) {
		// 4. Load the chat
		document.getElementById("initial-view").style.display = "none";
		chatView.style.display = "block";
		setTimeout(() => {
			window.electronAPI.sendCommand(['./public/default.jpg']);
		}, 500);
		return;
	}
	statusMsg.textContent = data.content;
});

// Receive chat response from Ollama server
window.electronAPI.onChatReply((event, data) => {
	// clear loading animation
	responseElem = document.querySelector(".history-chat-response");

	const loading = responseElem.querySelector(".loading");
	if (loading) {
		loading.remove();
	}
	
	if (!data.success) {
		if (data.content !== "The operation was aborted.") {
			// Don't display an error if the user stopped the request
			responseElem.innerText = "Error: " + data.content;
		}
		return;
	}
	
	if (data.content.message.content && data.content.message.content.length > 0) {
		console.log(data.content.message.content);
		responseElem.innerText += data.content.message.content;
	}
	
	if (data.content.done) {
		console.log('done');
	}
});

let responseBuffer = '';
let isBufferingMarkdown = false;

// Update the display when a response is received from the Ollama server
function displayResponse(response) {
	responseBuffer += response;
	
	if (!responseBuffer.endsWith('`') || response.done) {
		displayRegularText(responseBuffer);
		responseBuffer = '';
	}
}


// A modelGet response means the settings view should be displayed, it is checking what the current loaded model is
window.electronAPI.onModelGet((event, data) => {
	if (!data.success) {
		console.log("Error getting model: " + data.content);
	}
	modelSelectInput.value = data.content;
});
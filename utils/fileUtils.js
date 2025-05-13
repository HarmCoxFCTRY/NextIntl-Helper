// utils/fileUtils.js - File system utilities and context management
const vscode = require("vscode");

let extensionContext = null;

/**
 * Set up the extension context for later use
 * @param {vscode.ExtensionContext} context
 */
function setupContext(context) {
  extensionContext = context;
}

/**
 * Get the extension context
 * @returns {vscode.ExtensionContext} The extension context
 */
function getContext() {
  return extensionContext;
}

module.exports = {
  setupContext,
  getContext,
};

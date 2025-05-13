// extension.js - Main entry point for the extension
const vscode = require("vscode");
const commandHandlers = require("./commandHandlers");
const hoverProvider = require("./hoverProvider");
const { setupContext } = require("./utils/fileUtils");

/**
 * Activates the extension when a qualifying file is opened
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("Translation Helper extension is now active");

  // Initialize context
  setupContext(context);

  // Register all the commands
  const showTranslationDisposable = vscode.commands.registerCommand(
    "translationHelper.showTranslation",
    commandHandlers.showTranslation
  );

  const insertTranslationKeyDisposable = vscode.commands.registerCommand(
    "translationHelper.insertTranslationKey",
    commandHandlers.insertTranslationKey
  );

  const addTranslationKeyDisposable = vscode.commands.registerCommand(
    "translationHelper.addTranslationKey",
    commandHandlers.addTranslationKey
  );

  const addTranslationKeyFromHoverDisposable = vscode.commands.registerCommand(
    "translationHelper.addTranslationKeyFromHover",
    commandHandlers.addTranslationKeyFromHover
  );

  // Register hover provider for translation keys
  const translationHoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    hoverProvider
  );

  // Add all disposables to the context subscriptions
  context.subscriptions.push(
    showTranslationDisposable,
    insertTranslationKeyDisposable,
    addTranslationKeyDisposable,
    addTranslationKeyFromHoverDisposable,
    translationHoverProvider
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

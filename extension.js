// extension.js - Main entry point for the extension
const vscode = require("vscode");
const commandHandlers = require("./commandHandlers");
const hoverProvider = require("./hoverProvider");
const completionProvider = require("./completionProvider");
const textHighlighter = require("./textHighlighter");
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
    "nextIntlHelper.showTranslation",
    commandHandlers.showTranslation
  );

  const insertTranslationKeyDisposable = vscode.commands.registerCommand(
    "nextIntlHelper.insertTranslationKey",
    commandHandlers.insertTranslationKey
  );

  const addTranslationKeyDisposable = vscode.commands.registerCommand(
    "nextIntlHelper.addTranslationKey",
    commandHandlers.addTranslationKey
  );

  const addTranslationKeyFromHoverDisposable = vscode.commands.registerCommand(
    "nextIntlHelper.addTranslationKeyFromHover",
    commandHandlers.addTranslationKeyFromHover
  );

  // Register hover provider for translation keys
  const translationHoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    hoverProvider
  );

  // Register completion provider for translation keys
  const translationCompletionProvider = vscode.languages.registerCompletionItemProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    completionProvider,
    ".", // Trigger completion after typing a dot
    "\"", // Trigger completion after typing a quote
    "'" // Trigger completion after typing a single quote
  );

  // Register text highlighter for untranslated strings
  textHighlighter.registerTextHighlighter(context);

  // Add all disposables to the context subscriptions
  context.subscriptions.push(
    showTranslationDisposable,
    insertTranslationKeyDisposable,
    addTranslationKeyDisposable,
    addTranslationKeyFromHoverDisposable,
    translationHoverProvider,
    translationCompletionProvider
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

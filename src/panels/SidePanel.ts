import * as vscode from 'vscode';

export class SidePanel {
    private static currentPanel: SidePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;

        // Set initial content
        this._panel.webview.html = this._getWebviewContent();

        // Handle panel disposal
        this._panel.onDidDispose(
            () => {
                SidePanel.currentPanel = undefined;
                this.dispose();
            },
            null,
            this._disposables
        );

        // Listen for messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'chat':
                        // Handle chat message
                        await this._handleChatMessage(message.text);
                        break;
                    case 'compose':
                        // Handle code composition
                        await this._handleCodeComposition(message.text);
                        break;
                    case 'findBug':
                        // Handle bug finding
                        await this._handleBugFinding();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        SidePanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }

    private async _handleChatMessage(text: string) {
        // Add response to chat
        this._panel.webview.postMessage({
            command: 'addResponse',
            text: `Assistant: Processing "${text}"...`
        });
    }

    private async _handleCodeComposition(text: string) {
        // Handle code generation
        const response = `Generated code for: ${text}`;
        this._panel.webview.postMessage({
            command: 'showGeneratedCode',
            text: response
        });
    }

    private async _handleBugFinding() {
        // Handle bug finding
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const text = editor.document.getText();
            this._panel.webview.postMessage({
                command: 'showBugResults',
                text: 'Analyzing code...'
            });
        }
    }

    public static createOrShow() {
        // Open panel in right side with specific dimensions
        const panel = vscode.window.createWebviewPanel(
            'abapTools',
            'ABAP Tools',
            {
                viewColumn: vscode.ViewColumn.Three, // Show in third column
                preserveFocus: true
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        // Set initial dimensions
        panel.webview.html = new SidePanel(panel)._getWebviewContent();
    }

    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 16px;
                    height: 100vh;
                    box-sizing: border-box;
                }
                .tab-container { 
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 16px;
                    background: var(--vscode-tab-activeBackground);
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                .tab {
                    padding: 10px 20px;
                    cursor: pointer;
                    background: transparent;
                    border: none;
                    color: var(--vscode-tab-inactiveForeground);
                    margin-right: 4px;
                    border-radius: 4px 4px 0 0;
                    transition: all 0.2s;
                }
                .tab:hover {
                    background: var(--vscode-tab-hoverBackground);
                }
                .tab.active {
                    color: var(--vscode-tab-activeForeground);
                    background: var(--vscode-tab-activeBackground);
                    border-bottom: 2px solid var(--vscode-tab-activeBorder);
                    font-weight: bold;
                }
                .content {
                    padding: 20px;
                    display: none;
                    height: calc(100vh - 120px);
                    overflow-y: auto;
                }
                .content.active {
                    display: flex;
                    flex-direction: column;
                }
                .chat-input {
                    width: calc(100% - 20px);
                    padding: 12px;
                    margin-top: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-size: 14px;
                }
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 16px;
                    margin-bottom: 16px;
                    border-radius: 6px;
                    background: var(--vscode-editor-background);
                }
                .message {
                    margin-bottom: 12px;
                    padding: 8px 12px;
                    border-radius: 4px;
                    max-width: 85%;
                }
                .message.user {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    margin-left: auto;
                }
                .message.assistant {
                    background: var(--vscode-editor-lineHighlightBackground);
                    margin-right: auto;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    cursor: pointer;
                    border-radius: 4px;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                textarea {
                    width: calc(100% - 24px);
                    height: 200px;
                    padding: 12px;
                    margin-bottom: 16px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    resize: vertical;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 14px;
                }
                h3 {
                    margin-top: 0;
                    color: var(--vscode-foreground);
                    font-size: 16px;
                    font-weight: 500;
                }
                #bugResults {
                    margin-top: 16px;
                    padding: 12px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="tab-container">
                <button class="tab active" onclick="showTab('chat')">Chat</button>
                <button class="tab" onclick="showTab('composer')">Composer</button>
                <button class="tab" onclick="showTab('bugfinder')">Bug Finder</button>
            </div>

            <div id="chat" class="content active">
                <div class="chat-messages" id="chatMessages"></div>
                <input type="text" class="chat-input" placeholder="Ask anything about ABAP..." 
                    onkeypress="if(event.key === 'Enter') sendMessage(this.value)">
            </div>

            <div id="composer" class="content">
                <h3>Code Composer</h3>
                <textarea style="width: 100%; height: 200px;" 
                    placeholder="Describe the ABAP code you want to generate..."></textarea>
                <button onclick="generateCode()">Generate Code</button>
            </div>

            <div id="bugfinder" class="content">
                <h3>Bug Finder</h3>
                <button onclick="analyzeCurrent()">Analyze Current File</button>
                <div id="bugResults"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function showTab(tabName) {
                    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById(tabName).classList.add('active');
                    document.querySelector(\`.tab[onclick="showTab('\${tabName}')"]\`).classList.add('active');
                }

                function sendMessage(message) {
                    if (message.trim()) {
                        vscode.postMessage({
                            command: 'chat',
                            text: message
                        });
                        addMessage('You: ' + message);
                        document.querySelector('.chat-input').value = '';
                    }
                }

                function addMessage(message) {
                    const messagesDiv = document.getElementById('chatMessages');
                    const isUser = message.startsWith('You: ');
                    const className = isUser ? 'message user' : 'message assistant';
                    const text = isUser ? message.substring(5) : message;
                    messagesDiv.innerHTML += \`<div class="\${className}">\${text}</div>\`;
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }

                function generateCode() {
                    const text = document.querySelector('#composer textarea').value;
                    vscode.postMessage({
                        command: 'compose',
                        text: text
                    });
                }

                function analyzeCurrent() {
                    vscode.postMessage({
                        command: 'findBug'
                    });
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'addResponse':
                            addMessage(message.text);
                            break;
                        case 'showGeneratedCode':
                            document.querySelector('#composer textarea').value = message.text;
                            break;
                        case 'showBugResults':
                            document.getElementById('bugResults').innerHTML = message.text;
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
} 
import * as vscode from 'vscode';

export interface ClassDetails {
    project: string;
    package: string;
    name: string;
    description: string;
    superclass?: string;
    interfaces?: string[];
}

export class CreateClassDialog {
    constructor(private packageName: string) {}

    async show(): Promise<ClassDetails | undefined> {
        const panel = vscode.window.createWebviewPanel(
            'createClass',
            'Create ABAP Class',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const config = vscode.workspace.getConfiguration('abap-tools');
        const project = config.get<string>('defaultProject') || '';

        panel.webview.html = this.getWebviewContent(project, this.packageName);

        return new Promise((resolve) => {
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'createClass':
                            resolve(message.classDetails);
                            panel.dispose();
                            break;
                        case 'cancel':
                            resolve(undefined);
                            panel.dispose();
                            break;
                    }
                },
                undefined
            );
        });
    }

    private getWebviewContent(project: string, packageName: string): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <style>
                body { padding: 10px; font-family: var(--vscode-font-family); }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; }
                input, textarea { 
                    width: 100%; 
                    padding: 5px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                .buttons { margin-top: 20px; }
                button {
                    padding: 8px 15px;
                    margin-right: 10px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                .required { color: red; }
            </style>
        </head>
        <body>
            <form id="classForm">
                <div class="form-group">
                    <label>Project <span class="required">*</span></label>
                    <input type="text" id="project" value="${project}" readonly>
                </div>
                <div class="form-group">
                    <label>Package <span class="required">*</span></label>
                    <input type="text" id="package" value="${packageName}" readonly>
                </div>
                <div class="form-group">
                    <label>Name <span class="required">*</span></label>
                    <input type="text" id="name" placeholder="ZCL_YOUR_CLASS_NAME" required>
                </div>
                <div class="form-group">
                    <label>Description <span class="required">*</span></label>
                    <input type="text" id="description" required>
                </div>
                <div class="form-group">
                    <label>Original Language</label>
                    <input type="text" id="language" value="EN" readonly>
                </div>
                <div class="form-group">
                    <label>Superclass</label>
                    <input type="text" id="superclass">
                </div>
                <div class="form-group">
                    <label>Interfaces (comma-separated)</label>
                    <input type="text" id="interfaces" placeholder="IF_INTERFACE1, IF_INTERFACE2">
                </div>
                <div class="buttons">
                    <button type="submit">Create</button>
                    <button type="button" onclick="cancel()">Cancel</button>
                </div>
            </form>
            <script>
                document.getElementById('classForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const vscode = acquireVsCodeApi();
                    const classDetails = {
                        project: document.getElementById('project').value,
                        package: document.getElementById('package').value,
                        name: document.getElementById('name').value,
                        description: document.getElementById('description').value,
                        superclass: document.getElementById('superclass').value,
                        interfaces: document.getElementById('interfaces').value.split(',').map(i => i.trim()).filter(i => i)
                    };
                    vscode.postMessage({
                        command: 'createClass',
                        classDetails: classDetails
                    });
                });

                function cancel() {
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({ command: 'cancel' });
                }
            </script>
        </body>
        </html>`;
    }
} 
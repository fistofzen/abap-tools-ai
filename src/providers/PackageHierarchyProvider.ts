import * as vscode from 'vscode';
import { AdtService } from '../services/AdtService';
import { CreateClassDialog } from '../dialogs/CreateClassDialog';

export class PackageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly packageUri?: string,
        public readonly type: 'package' | 'virtualFolder' | 'class' = 'package',
        public readonly counter?: number,
        public readonly facet?: string,
        public readonly whatisclicked?: string,
        public readonly hasChildrenOfSameFacet?: string,
        public readonly parent?: PackageItem
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        
        // Set different icons based on type and facet
        switch (type) {
            case 'package':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'virtualFolder':
                switch (facet) {
                    case 'CLAS':
                        this.iconPath = new vscode.ThemeIcon('symbol-class');
                        break;
                    case 'PROG':
                    case 'REPO':
                        this.iconPath = new vscode.ThemeIcon('file-code');
                        break;
                    case 'INTF':
                        this.iconPath = new vscode.ThemeIcon('symbol-interface');
                        break;
                    case 'FUGR':
                        this.iconPath = new vscode.ThemeIcon('symbol-method');
                        break;
                    case 'TABL':
                        this.iconPath = new vscode.ThemeIcon('database');
                        break;
                    case 'TTYP':
                        this.iconPath = new vscode.ThemeIcon('symbol-enum');
                        break;
                    case 'DTEL':
                        this.iconPath = new vscode.ThemeIcon('symbol-field');
                        break;
                    case 'DOMA':
                        this.iconPath = new vscode.ThemeIcon('symbol-ruler');
                        break;
                    default:
                        this.iconPath = new vscode.ThemeIcon('folder');
                }
                this.description = counter ? `(${counter})` : undefined;
                break;
            case 'class':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
        }
        
        this.contextValue = type;
    }
}

export class PackageHierarchyProvider implements vscode.TreeDataProvider<PackageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private adtService: AdtService) {
        // Register create class command
        vscode.commands.registerCommand('abap-tools.createClass', async (item: PackageItem) => {
            if (!item.packageUri) {
                vscode.window.showErrorMessage('No package selected');
                return;
            }

            const dialog = new CreateClassDialog(item.label);
            const classDetails = await dialog.show();
            
            if (classDetails) {
                try {
                    await this.adtService.createClass(classDetails);
                    this.refresh(); // Refresh the tree view
                    vscode.window.showInformationMessage(`Class ${classDetails.name} created successfully`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create class: ${error}`);
                }
            }
        });

        // Add double-click handler for both programs and classes
        vscode.commands.registerCommand('abap-tools.openSource', async (item: PackageItem) => {
            if (item.type === 'virtualFolder') {
                try {
                    let source: string;
                    if (item.facet === 'REPO') {
                        source = await this.adtService.getProgramSource(item.label);
                    } else if (item.facet === 'CLAS') {
                        source = await this.adtService.getClassSource(item.label);
                    } else {
                        return;
                    }
                    
                    // Create and show document
                    const document = await vscode.workspace.openTextDocument({
                        content: source,
                        language: 'abap'
                    });
                    await vscode.window.showTextDocument(document);
                    await vscode.commands.executeCommand('editor.action.formatDocument');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to open source: ${error}`);
                }
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        const treeItem = element;
        if (element.type === 'virtualFolder' && (element.facet === 'REPO' || element.facet === 'CLAS')) {
            treeItem.command = {
                command: 'abap-tools.openSource',
                title: 'Open Source',
                arguments: [element]
            };
        }
        return treeItem;
    }

    async getChildren(element?: PackageItem): Promise<PackageItem[]> {
        const connectionInfo = this.adtService.getConnectionInfo();
        if (!connectionInfo.isConnected) {
            return [new PackageItem('Not connected to SAP', vscode.TreeItemCollapsibleState.None)];
        }
    
        try {
            if (!element) {
                // Root level - show main packages
                const packages = await this.adtService.getPackages();
                return packages.map(pkg => 
                    new PackageItem(
                        pkg.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        pkg.uri,
                        'package',
                        0,
                        'package',
                        "package", 
                        "true"
                    )
                );
            } else if (element.type === 'package') {
                // Get virtual folders for the package
                const virtualFolders = await this.adtService.getVirtualFolderContents(
                    element.packageUri!,
                    'package',
                    element.label,
                    "SOURCE_LIBRARY",""
                );


                console.log("Virtual folders:", virtualFolders);
                
                // Process virtual folders
                const processedFolders: PackageItem[] = [];
                for (const folder of virtualFolders) {
                    // If it's a package folder starting with "..", make another call
                    if (folder.facet === 'PACKAGE' && folder.name.startsWith('..')) {
                        const actualPackageName = folder.name.substring(2); // Remove ".." prefix
                        const subFolders = await this.adtService.getVirtualFolderContents(
                            element.packageUri!,
                            'PACKAGE',
                            actualPackageName,
                            "SOURCE_LIBRARY",
                            element.parent?.label || ""
                        );
                        
                        processedFolders.push(...subFolders.map(subfolder => 
                            new PackageItem(
                                subfolder.name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                element.packageUri,
                                'virtualFolder',
                                subfolder.counter,
                                subfolder.facet,
                                subfolder.whatisclicked,
                                subfolder.hasChildrenOfSameFacet,
                                element
                            )
                        ));
                    } else {
                        processedFolders.push(
                            new PackageItem(
                                folder.name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                element.packageUri,
                                'virtualFolder',
                                folder.counter,
                                folder.facet,
                                folder.whatisclicked,
                                folder.hasChildrenOfSameFacet,
                                element
                            )
                        );
                    }
                }
                return processedFolders;
            } else {
                // Handle other virtual folders

                if (element.facet === "TYPE") {
                    // Get the parent's name when facet is TYPE
                    const parentName = element.parent?.label || "";
                    console.log("Parent name for TYPE:", parentName);
                }

                const virtualFolders = await this.adtService.getVirtualFolderContents(
                    element.packageUri!,
                    element.facet!,
                    element.label,
                    element.label,
                    element.parent?.label || ""
                );

                return virtualFolders.map(folder => 
                    new PackageItem(
                        folder.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.packageUri,
                        'virtualFolder',
                        folder.counter,
                        folder.facet,
                        folder.whatisclicked,
                        folder.hasChildrenOfSameFacet,
                        element
                    )
                );
            }
        } catch (error) {
            console.error('Failed to load items:', error);
            return [new PackageItem('Error loading items', vscode.TreeItemCollapsibleState.None)];
        }
        return [];
    }
} 
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { Parser } from 'xml2js';

// Interfaces for different ADT responses
interface AdtDiscoveryResponse {
    links: {
        href: string;
        rel: string;
        title: string;
    }[];
}

interface AdtObjectStructure {
    objectName: string;
    objectType: string;
    children?: AdtObjectStructure[];
}

interface ConnectionInfo {
    url: string;
    username: string | undefined;
    isConnected: boolean;
}

// Add new interface for package structure
interface AdtPackage {
    name: string;
    uri: string;
    type: string;
    description?: string;
}

// Add interface for class details
interface ClassDetails {
    name: string;
    description: string;
    superclass?: string;
    interfaces?: string[];
    package?: string;
    language?: string;
}

interface AdtClass {
    name: string;
    uri: string;
    type: string;
    description?: string;
}

export class AdtService {
    private baseUrl: string;
    private credentials: string = '';
    private csrfToken: string = '';
    private username: string | undefined;

    constructor(isTestMode: boolean = false) {
        const config = vscode.workspace.getConfiguration('abap-tools');
        if (isTestMode) {
            this.baseUrl = 'https://gclp0285.devint.net.sap:8443/sap/bc/adt';
            return;
        }
        const protocol = config.get<string>('defaultPort') === '8443' ? 'https' : 'https';
        const host = config.get<string>('defaultHost');
        const port = config.get<string>('defaultPort');
        
        if (!host) {
            throw new Error('SAP host not configured. Please set abap-tools.defaultHost in settings.');
        }
        
        this.baseUrl = `${protocol}://${host}:${port}/sap/bc/adt`;
    }

    // Get connection info without exposing password
    getConnectionInfo(): ConnectionInfo {
        return {
            url: this.baseUrl,
            username: this.username,
            isConnected: Boolean(this.credentials)  // Only check credentials for now
        };
    }

    // Repository Operations
    async getRepository(objectPath: string): Promise<any> {
        return this.request(`/repository/${objectPath}`);
    }

    // Program Operations
    async getProgram(programName: string): Promise<string> {
        return this.request(`/programs/programs/${programName}/source/main`);
    }

    async validateProgramSyntax(programName: string, source: string): Promise<any> {
        return this.request(
            `/programs/programs/${programName}/syntax`,
            'POST',
            source
        );
    }

    // Class Operations
    async getClass(className: string): Promise<any> {
        return this.request(`/oo/classes/${className}`);
    }

    // ATC (ABAP Test Cockpit) Operations
    async runAtcCheck(objectUri: string): Promise<any> {
        return this.request(`/atc/runs?objectUri=${encodeURIComponent(objectUri)}`, 'POST');
    }

    // Transport Operations
    async getTransports(): Promise<any> {
        return this.request('/cts/transports');
    }

    // Core functionality
    private async request(path: string, method: string = 'GET', body?: string, headers?: Record<string, string>): Promise<string> {
        try {
            const defaultHeaders: Record<string, string> = {
                'Authorization': `Basic ${this.credentials}`,
                'Accept': '*/*'
            };

            if (headers) {
                Object.assign(defaultHeaders, headers);
            }

            // For non-GET requests or if we don't have a CSRF token yet
            if (method !== 'GET' || !this.csrfToken) {
                const tokenResponse = await fetch(`${this.baseUrl}/discovery`, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                        'Authorization': `Basic ${this.credentials}`,
                        'X-CSRF-Token': 'Fetch'
                    }
                });

                this.csrfToken = tokenResponse.headers.get('x-csrf-token') || '';
                const cookies = tokenResponse.headers.raw()['set-cookie'];
                if (cookies && cookies.length > 0) {
                    defaultHeaders['Cookie'] = cookies[1] || cookies[0];
                }
            }

            if (method !== 'GET') {
                defaultHeaders['X-CSRF-Token'] = this.csrfToken;
            }

            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: defaultHeaders,
                body
            });

            const responseText = await response.text();
            if (!response.ok) {
                console.error('Response:', responseText);
                throw new Error(`ADT request failed: ${response.statusText} (${response.status})\n${responseText}`);
            }

            return responseText;
        } catch (error) {
            console.error('Request failed:', error);
            throw error;
        }
    }

    // Authentication
    async setCredentials(username: string, password: string) {
        this.username = username;
        this.credentials = Buffer.from(`${username}:${password}`).toString('base64');
        // Test connection immediately
        await this.discoverService();
    }

    async discoverService(): Promise<AdtDiscoveryResponse> {
        try {
            const response = await this.request('/discovery');
            // Log the response for debugging
            console.log('Discovery response:', response);
            
            // Consider any response as successful for now
            vscode.window.showInformationMessage('ADT Service discovery successful');
            return { links: [] }; // Return empty links for now
        } catch (error) {
            vscode.window.showErrorMessage(`ADT Service discovery failed: ${error}`);
            throw error;
        }
    }

    async getObjectStructure(objectUri: string): Promise<AdtObjectStructure> {
        try {
            const response = await this.request(`/repository/nodestructure?objectUri=${encodeURIComponent(objectUri)}`);
            // For now, return a simple structure
            return {
                objectName: objectUri.split('/').pop() || '',
                objectType: 'unknown'
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get object structure: ${error}`);
            throw error;
        }
    }

    async getSourceCode(objectUri: string): Promise<string> {
        try {
            return await this.request(`/programs/programs/${objectUri}/source/main`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get source code: ${error}`);
            throw error;
        }
    }

    async validateSyntax(objectUri: string, sourceCode: string): Promise<any> {
        try {
            return await this.request(
                `/programs/programs/${objectUri}/syntax`,
                'POST',
                sourceCode
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Syntax validation failed: ${error}`);
            throw error;
        }
    }

    // Add new method for package operations
    async getPackages(parentUri?: string): Promise<AdtPackage[]> {
        try {
            if (!this.credentials) {
                throw new Error('Not connected to SAP');
            }

            const path = parentUri ? 
                `/repository/nodestructure?parent_uri=/sap/bc/adt/repository/informationsystem/mainpackages/${parentUri}` : 
                '/repository/nodestructure?parent_uri=/sap/bc/adt/repository/informationsystem/mainpackages';

            const response = await this.request(path, 'POST');
            console.log('Package response:', response); // For debugging

            // Parse XML response
            const parser = new Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(response);
            
            const packages: AdtPackage[] = [];
            
            // Extract packages from SAP's asx:values format
            const nodes = result?.['asx:abap']?.['asx:values']?.DATA.TREE_CONTENT.SEU_ADT_REPOSITORY_OBJ_NODE || [];
            const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
            
            nodeArray.forEach(node => {
                if (node.OBJECT_NAME && node.OBJECT_URI) {
                    packages.push({
                        name: node.OBJECT_NAME,
                        uri: node.OBJECT_URI,
                        type: node.OBJECT_TYPE || 'DEVC/K',
                        description: node.OBJECT_DESCRIPTION
                    });
                }
            });

            console.log('Parsed packages:', packages); // Debug output
            return packages;
        } catch (error) {
            console.error('Failed to get packages:', error);
            throw error;
        }
    }

    disconnect() {
        this.credentials = '';
        this.csrfToken = '';
        this.username = undefined;
    }

    async createClass(classDetails: ClassDetails): Promise<void> {
        // First validate the class name
        const validationPath = `/oo/validation/objectname?objname=${encodeURIComponent(classDetails.name)}&type=CLAS/OC`;
        await this.request(validationPath, 'GET', undefined, {
            'Accept': 'application/json'
        });

        // Then create the class
        const path = '/oo/classes';
        const body = `<?xml version="1.0" encoding="UTF-8"?>
            <class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
                            xmlns:adtcore="http://www.sap.com/adt/core"
                            abapLanguageVersion="standard">
                <adtcore:name>${classDetails.name}</adtcore:name>
                <adtcore:description>${classDetails.description}</adtcore:description>
                <adtcore:packageRef>
                    <adtcore:name>${classDetails.package}</adtcore:name>
                </adtcore:packageRef>
                <class:superClass>${classDetails.superclass || ''}</class:superClass>
                ${classDetails.interfaces?.map(i => `<class:interface>${i}</class:interface>`).join('\n') || ''}
            </class:abapClass>`;

        console.log('Creating class:', body);

        // Create the class
        await this.request(path, 'POST', body, {
            'Content-Type': 'application/vnd.sap.adt.oo.classes.v2+xml',
            'Accept': 'application/vnd.sap.adt.oo.classes.v2+xml'
        });

        // Finally create the source
        const sourcePath = `/oo/classes/${classDetails.name}/source/main`;
        const sourceBody = this.generateClassSource(classDetails);
        
        await this.request(sourcePath, 'PUT', sourceBody, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Accept': 'text/plain'
        });
    }

    private generateClassSource(classDetails: ClassDetails): string {
        return `CLASS ${classDetails.name} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    ${classDetails.interfaces?.map(i => `INTERFACES ${i}.`).join('\n    ') || ''}
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${classDetails.name} IMPLEMENTATION.
ENDCLASS.`;
    }

    async getRootPackageContents(packageUri: string): Promise<AdtClass[]> {
        try {
            const path = '/repository/informationsystem/virtualfolders/contents';
            const body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
            <vfs:preselection facet="package">
            <vfs:value>ZTEST61</vfs:value>
            </vfs:preselection>
            <vfs:facetorder>
            <vfs:facet>package</vfs:facet>
            <vfs:facet>group</vfs:facet>
            <vfs:facet>type</vfs:facet>
            </vfs:facetorder>
            </vfs:virtualFoldersRequest>`;


                const body2 = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
            <vfs:preselection facet="package">
            <vfs:value>..ZTEST61</vfs:value>
            </vfs:preselection>
            <vfs:facetorder>
            <vfs:facet>group</vfs:facet>
            <vfs:facet>type</vfs:facet>
            </vfs:facetorder>
            </vfs:virtualFoldersRequest>`;


                const body3 = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
            <vfs:preselection facet="group">
            <vfs:value>SOURCE_LIBRARY</vfs:value>
            </vfs:preselection>
            <vfs:preselection facet="package">
            <vfs:value>..ZTEST61</vfs:value>
            </vfs:preselection>
            <vfs:facetorder>
            <vfs:facet>type</vfs:facet>
            </vfs:facetorder>
            </vfs:virtualFoldersRequest>`;


               const body4 = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
            <vfs:preselection facet="group">
            <vfs:value>SOURCE_LIBRARY</vfs:value>
            </vfs:preselection>
            <vfs:preselection facet="package">
            <vfs:value>..ZTEST61</vfs:value>
            </vfs:preselection>
            <vfs:preselection facet="type">
            <vfs:value>CLAS</vfs:value>
            </vfs:preselection>
            <vfs:facetorder></vfs:facetorder>
            </vfs:virtualFoldersRequest>`;



            const body5 = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
            <vfs:preselection facet="group">
            <vfs:value>SOURCE_LIBRARY</vfs:value>
            </vfs:preselection>
            <vfs:preselection facet="package">
            <vfs:value>..ZTEST61</vfs:value>
            </vfs:preselection>
            <vfs:preselection facet="type">
            <vfs:value>REPO</vfs:value>
            </vfs:preselection>
            <vfs:facetorder></vfs:facetorder>
            </vfs:virtualFoldersRequest>`;

            const response = await this.request(path, 'POST', body3, {
                'Accept': 'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
               'Content-Type':'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
                'User-Agent': 'vscode-abap-tools',
                'X-sap-adt-profiling': 'server-time'
            });

            // Parse XML response
            const parser = new Parser({ 
                explicitArray: false,
                xmlns: true,
                tagNameProcessors: [(name) => {
                    return name.replace(/^vfs:/, '');
                }]
            });
            const result = await parser.parseStringPromise(response);

            const classes: AdtClass[] = [];
            const objects = result?.['virtualFoldersResult']?.['virtualFolder'] || [];  
            const objectArray = Array.isArray(objects) ? objects : [objects];

            objectArray.forEach(obj => {
                if (obj.$ && obj.$.uri && obj.$.name) {
                    classes.push({
                        name: obj.$.name,
                        uri: obj.$.uri,
                        type: obj.$.type || 'CLAS/OC',
                        description: obj.$.description
                    });
                }
            });


            
            console.log('Parsed classes:', classes); // Debug output
            return classes;
        } catch (error) {
            console.error('Failed to get classes:', error);
            throw error;
        }
    }
} 


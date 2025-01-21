import * as vscode from 'vscode';
import fetch from 'node-fetch';

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

export class AdtService {
    private baseUrl: string;
    private credentials: string = '';
    private csrfToken: string = '';
    private username: string | undefined;

    constructor(isTestMode: boolean = false) {
        const config = vscode.workspace.getConfiguration('abap-tools');
        if (isTestMode) {
            this.baseUrl = 'http://test.sap.server:44300/sap/bc/adt';
            return;
        }
        const protocol = config.get<string>('defaultPort') === '44300' ? 'https' : 'http';
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
            isConnected: Boolean(this.credentials && this.csrfToken)
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
    private async request(path: string, method: string = 'GET', body?: string): Promise<string> {
        try {
            const headers: Record<string, string> = {
                'Authorization': `Basic ${this.credentials}`,
                'Accept': '*/*'
            };

            if (method !== 'GET') {
                // For non-GET requests, first fetch CSRF token
                if (!this.csrfToken) {
                    const tokenResponse = await fetch(`${this.baseUrl}/discovery`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Basic ${this.credentials}`,
                            'X-CSRF-Token': 'Fetch'
                        }
                    });
                    this.csrfToken = tokenResponse.headers.get('x-csrf-token') || '';
                }
                headers['X-CSRF-Token'] = this.csrfToken;
            }

            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers,
                body
            });

            if (!response.ok) {
                throw new Error(`ADT request failed: ${response.statusText} (${response.status})`);
            }

            return response.text();
        } catch (error) {
            vscode.window.showErrorMessage(`ADT API error: ${error}`);
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
            const path = parentUri ? 
                `/repository/nodestructure?parent_uri=/sap/bc/adt/packages/${parentUri}` : 
                '/repository/nodestructure?parent_uri=/sap/bc/adt/packages';

            const response = await this.request(path);
            console.log('Package response:', response); // For debugging

            // For now return dummy data until we parse XML properly
            return [
                { name: '$TMP', uri: '/sap/bc/adt/packages/$TMP', type: 'DEVC/K' },
                { name: 'ZLOCAL', uri: '/sap/bc/adt/packages/ZLOCAL', type: 'DEVC/K' },
                { name: 'ZTEST', uri: '/sap/bc/adt/packages/ZTEST', type: 'DEVC/K' }
            ];
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
} 
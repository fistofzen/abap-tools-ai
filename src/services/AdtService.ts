import * as vscode from "vscode";
import fetch from "node-fetch";
import { Parser } from "xml2js";

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
    whatisclicked: string;
    hasChildrenOfSameFacet: string;
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

interface VirtualFolder {
    name: string;
    displayName: string;
    counter: number;
    facet: string;
    type: string;
    vituri: string;
    isExpandable: boolean;
    whatisclicked: string;
    hasChildrenOfSameFacet: string;
}

export class AdtService {
    private baseUrl: string;
    private credentials: string = "";
    private csrfToken: string = "";
    private username: string | undefined;

    constructor(isTestMode: boolean = false) {
        const config = vscode.workspace.getConfiguration("abap-tools");
        if (isTestMode) {
            this.baseUrl = "http://test.sap.server:44300/sap/bc/adt";
            return;
        }
        const protocol =
            config.get<string>("defaultPort") === "44300" ? "https" : "http";
        const host = config.get<string>("defaultHost");
        const port = config.get<string>("defaultPort");

        if (!host) {
            throw new Error(
                "SAP host not configured. Please set abap-tools.defaultHost in settings."
            );
        }

        this.baseUrl = `${protocol}://${host}:${port}/sap/bc/adt`;
    }

    // Get connection info without exposing password
    getConnectionInfo(): ConnectionInfo {
        return {
            url: this.baseUrl,
            username: this.username,
            isConnected: Boolean(this.credentials), // Only check credentials for now
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

    async validateProgramSyntax(
        programName: string,
        source: string
    ): Promise<any> {
        return this.request(
            `/programs/programs/${programName}/syntax`,
            "POST",
            source
        );
    }

    // Class Operations
    async getClass(className: string): Promise<any> {
        return this.request(`/oo/classes/${className}`);
    }

    // ATC (ABAP Test Cockpit) Operations
    async runAtcCheck(objectUri: string): Promise<any> {
        return this.request(
            `/atc/runs?objectUri=${encodeURIComponent(objectUri)}`,
            "POST"
        );
    }

    // Transport Operations
    async getTransports(): Promise<any> {
        return this.request("/cts/transports");
    }

    // Core functionality
    private async request(
        path: string,
        method: string = "GET",
        body?: string,
        headers?: Record<string, string>
    ): Promise<string> {
        try {
            const defaultHeaders: Record<string, string> = {
                Authorization: `Basic ${this.credentials}`,
                Accept: "*/*",
            };

            if (headers) {
                Object.assign(defaultHeaders, headers);
            }

            // For non-GET requests or if we don't have a CSRF token yet
            if (method !== "GET" || !this.csrfToken) {
                const tokenResponse = await fetch(`${this.baseUrl}/discovery`, {
                    method: "GET",
                    headers: {
                        Accept: "*/*",
                        Authorization: `Basic ${this.credentials}`,
                        "X-CSRF-Token": "Fetch",
                    },
                });

                this.csrfToken = tokenResponse.headers.get("x-csrf-token") || "";
                const cookies = tokenResponse.headers.raw()["set-cookie"];
                if (cookies && cookies.length > 0) {
                    defaultHeaders["Cookie"] = cookies[1] || cookies[0];
                }
            }

            if (method !== "GET") {
                defaultHeaders["X-CSRF-Token"] = this.csrfToken;
            }

            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: defaultHeaders,
                body,
            });

            const responseText = await response.text();
            if (!response.ok) {
                console.error("Response:", responseText);
                throw new Error(
                    `ADT request failed: ${response.statusText} (${response.status})\n${responseText}`
                );
            }

            return responseText;
        } catch (error) {
            console.error("Request failed:", error);
            throw error;
        }
    }

    // Authentication
    async setCredentials(username: string, password: string) {
        this.username = username;
        this.credentials = Buffer.from(`${username}:${password}`).toString(
            "base64"
        );
        // Test connection immediately
        await this.discoverService();
    }

    async discoverService(): Promise<AdtDiscoveryResponse> {
        try {
            const response = await this.request("/discovery");
            // Log the response for debugging
            console.log("Discovery response:", response);

            // Consider any response as successful for now
            vscode.window.showInformationMessage("ADT Service discovery successful");
            return { links: [] }; // Return empty links for now
        } catch (error) {
            vscode.window.showErrorMessage(`ADT Service discovery failed: ${error}`);
            throw error;
        }
    }

    async getObjectStructure(objectUri: string): Promise<AdtObjectStructure> {
        try {
            const response = await this.request(
                `/repository/nodestructure?objectUri=${encodeURIComponent(objectUri)}`
            );
            // For now, return a simple structure
            return {
                objectName: objectUri.split("/").pop() || "",
                objectType: "unknown",
            };
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to get object structure: ${error}`
            );
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
                "POST",
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
                throw new Error("Not connected to SAP");
            }

            const path = parentUri
                ? `/repository/nodestructure?parent_uri=/sap/bc/adt/repository/informationsystem/mainpackages/${parentUri}`
                : "/repository/nodestructure?parent_uri=/sap/bc/adt/repository/informationsystem/mainpackages";

            const path2 =
                "/repository/nodestructure?parent_type=DEVC/K&withShortDescriptions=${true}&parent_name=ZTEST61";
            const response = await this.request(path, "POST");

            const response2 = await this.request(path2, "POST");

            console.log("Package response:", response2); // For debugging

            // Parse XML response
            const parser = new Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(response);

            const packages: AdtPackage[] = [];

            // Extract packages from SAP's asx:values format
            const nodes =
                result?.["asx:abap"]?.["asx:values"]?.DATA.TREE_CONTENT
                    .SEU_ADT_REPOSITORY_OBJ_NODE || [];
            const nodeArray = Array.isArray(nodes) ? nodes : [nodes];

            nodeArray.forEach((node) => {
                if (node.OBJECT_NAME && node.OBJECT_URI) {
                    packages.push({
                        name: node.OBJECT_NAME,
                        uri: node.OBJECT_URI,
                        type: node.OBJECT_TYPE || "DEVC/K",
                        description: node.OBJECT_DESCRIPTION,
                        whatisclicked: "package",
                        hasChildrenOfSameFacet: "true",
                    });
                }
            });

            console.log("Parsed packages:", packages); // Debug output
            return packages;
        } catch (error) {
            console.error("Failed to get packages:", error);
            throw error;
        }
    }

    disconnect() {
        this.credentials = "";
        this.csrfToken = "";
        this.username = undefined;
    }

    async createClass(classDetails: ClassDetails): Promise<void> {
        // First validate the class name
        const validationPath = `/oo/validation/objectname?objname=${encodeURIComponent(
            classDetails.name
        )}&type=CLAS/OC`;
        await this.request(validationPath, "GET", undefined, {
            Accept: "application/json",
        });

        // Then create the class
        const path = "/oo/classes";
        const body = `<?xml version="1.0" encoding="UTF-8"?>
            <class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
                            xmlns:adtcore="http://www.sap.com/adt/core"
                            abapLanguageVersion="standard">
                <adtcore:name>${classDetails.name}</adtcore:name>
                <adtcore:description>${classDetails.description
            }</adtcore:description>
                <adtcore:packageRef>
                    <adtcore:name>${classDetails.package}</adtcore:name>
                </adtcore:packageRef>
                <class:superClass>${classDetails.superclass || ""
            }</class:superClass>
                ${classDetails.interfaces
                ?.map((i) => `<class:interface>${i}</class:interface>`)
                .join("\n") || ""
            }
            </class:abapClass>`;

        console.log("Creating class:", body);

        // Create the class
        await this.request(path, "POST", body, {
            "Content-Type": "application/vnd.sap.adt.oo.classes.v2+xml",
            Accept: "application/vnd.sap.adt.oo.classes.v2+xml",
        });

        // Finally create the source
        const sourcePath = `/oo/classes/${classDetails.name}/source/main`;
        const sourceBody = this.generateClassSource(classDetails);

        await this.request(sourcePath, "PUT", sourceBody, {
            "Content-Type": "text/plain; charset=utf-8",
            Accept: "text/plain",
        });
    }

    private generateClassSource(classDetails: ClassDetails): string {
        return `CLASS ${classDetails.name} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    ${classDetails.interfaces?.map((i) => `INTERFACES ${i}.`).join("\n    ") ||
            ""
            }
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${classDetails.name} IMPLEMENTATION.
ENDCLASS.`;
    }

    async getVirtualFolderContents(
        packageName: string,
        facetValue: string,
        name: string,
        groupName: string,
        parentName: string

    ): Promise<VirtualFolder[]> {
        // Extract package name from URI by removing any path segments
        const packageNameParts = packageName.split("/");
        const actualPackageName = packageNameParts[packageNameParts.length - 1];

        try {
            const path = "/repository/informationsystem/virtualfolders/contents";
            let body = "";
            if (facetValue === "package") {
                body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
        <vfs:preselection facet="${facetValue}">
        <vfs:value>${name}</vfs:value>
        </vfs:preselection>
        <vfs:facetorder>
        <vfs:facet>package</vfs:facet>
        <vfs:facet>group</vfs:facet>
        <vfs:facet>type</vfs:facet>
        </vfs:facetorder>
        </vfs:virtualFoldersRequest>`;
            } else if (facetValue === "PACKAGE") {
                body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
        <vfs:preselection facet="package">
        <vfs:value>..${name}</vfs:value>
        </vfs:preselection>
        <vfs:facetorder>
         
        <vfs:facet>group</vfs:facet>
        <vfs:facet>type</vfs:facet>
        </vfs:facetorder>
        </vfs:virtualFoldersRequest>`;
            } else if (facetValue === "GROUP") {
                body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
        <vfs:preselection facet="${facetValue}">
        <vfs:value>${name}</vfs:value>
        </vfs:preselection>
        <vfs:preselection facet="package">
        <vfs:value>..${actualPackageName}</vfs:value>
        </vfs:preselection>
        <vfs:facetorder>
        <vfs:facet>type</vfs:facet>
        </vfs:facetorder>
        </vfs:virtualFoldersRequest>`;
            }else if (facetValue === "TYPE") {
                body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
                    <vfs:preselection facet="group">
                    <vfs:value>SOURCE_LIBRARY</vfs:value>
                    </vfs:preselection>
                    <vfs:preselection facet="package">
                    <vfs:value>..${actualPackageName}</vfs:value>
                    </vfs:preselection>
                    <vfs:preselection facet="type">
                    <vfs:value>${parentName}</vfs:value>
                    </vfs:preselection>
                    <vfs:facetorder></vfs:facetorder>
                    </vfs:virtualFoldersRequest>
                    `;
            } else {
                /*     
               body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
                        <vfs:preselection facet="${facetValue}">
                            <vfs:value>${name}</vfs:value>
                        </vfs:preselection>
                        <vfs:preselection facet="package">
                            <vfs:value>..${actualPackageName}</vfs:value>
                        </vfs:preselection>
                        <vfs:preselection facet="type">
                            <vfs:value>type</vfs:value>
                        </vfs:preselection>
                        <vfs:facetorder></vfs:facetorder>
                    </vfs:virtualFoldersRequest>`;
        */

                body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
                        <vfs:preselection facet="${facetValue}">
                        <vfs:value>${name}</vfs:value>
                        </vfs:preselection>
                        <vfs:preselection facet="package">
                        <vfs:value>..${actualPackageName}</vfs:value>
                        </vfs:preselection>
                        <vfs:preselection facet="type">
                        <vfs:value>${groupName}</vfs:value>
                        </vfs:preselection>
                        <vfs:facetorder></vfs:facetorder>
                        </vfs:virtualFoldersRequest>`;
            }
            const response = await this.request(path, "POST", body, {
                Accept:
                    "application/vnd.sap.adt.repository.virtualfolders.result.v1+xml",
                "Content-Type":
                    "application/vnd.sap.adt.repository.virtualfolders.request.v1+xml",
                "User-Agent": "vscode-abap-tools",
                "X-sap-adt-profiling": "server-time",
            });

            ("");

            // Parse response and return items
            const parser = new Parser({
                explicitArray: false,
                xmlns: true,
                tagNameProcessors: [(name) => name.replace(/^vfs:/, "")],
            });

            const result = await parser.parseStringPromise(response);
            const items: VirtualFolder[] = [];

            const objects = result?.["virtualFoldersResult"]?.["virtualFolder"] || result?.["virtualFoldersResult"]?.["object"] || [];
            const objectArray = Array.isArray(objects) ? objects : [objects];

            objectArray.forEach((obj) => {
                if (obj.$) {
                    const isExpandable = obj.$.expandable?.value === "true";

                    let whatisclicked = "";
                    if (obj.$.facet?.value === "GROUP") {
                        whatisclicked = obj.$.name?.value;
                    }

                    items.push({
                        name: obj.$.name.value,
                        displayName: obj.$.displayName?.value || obj.$.name.value,
                        counter: parseInt(obj.$.counter?.value || "0", 10),
                        facet: obj.$.facet?.value || facetValue,
                        type: obj.$.type?.value,
                        vituri: obj.$.vituri?.value,
                        isExpandable: isExpandable,
                        hasChildrenOfSameFacet: obj.$.hasChildrenOfSameFacet?.value,
                        whatisclicked: "false",
                    });
                }
            });

            return items;
        } catch (error) {
            console.error(`Failed to get ${facetValue} items:`, error);
            throw error;
        }
    }

    async getRootPackageContents(packageName: string): Promise<VirtualFolder[]> {
        try {
            const path = "/repository/informationsystem/virtualfolders/contents";
            const body = `<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
                    <vfs:preselection facet="package">
                    <vfs:value>${packageName}</vfs:value>
                    </vfs:preselection>
                    <vfs:facetorder>
                    <vfs:facet>package</vfs:facet>
                    <vfs:facet>group</vfs:facet>
                    <vfs:facet>type</vfs:facet>
                    </vfs:facetorder>
                    </vfs:virtualFoldersRequest>`;

            const response = await this.request(path, "POST", body, {
                Accept:
                    "application/vnd.sap.adt.repository.virtualfolders.result.v1+xml",
                "Content-Type":
                    "application/vnd.sap.adt.repository.virtualfolders.request.v1+xml",
                "User-Agent": "vscode-abap-tools",
                "X-sap-adt-profiling": "server-time",
            });

            const parser = new Parser({
                explicitArray: false,
                xmlns: true,
                tagNameProcessors: [(name) => name.replace(/^vfs:/, "")],
            });

            const result = await parser.parseStringPromise(response);
            const folders: VirtualFolder[] = [];

            const virtualFolders =
                result?.["virtualFoldersResult"]?.["virtualFolder"] || [];
            const folderArray = Array.isArray(virtualFolders)
                ? virtualFolders
                : [virtualFolders];

            folderArray.forEach((folder) => {
                if (folder.$ && folder.$.name) {
                    let whatisclicked = "";
                    if (folder.$.facet?.value === "PACKAGE") {
                        whatisclicked = "package";
                    }

                    folders.push({
                        name: folder?.$?.name.value,
                        displayName: folder.$.displayName.value,
                        counter: parseInt(folder.$.counter.value, 10),
                        facet: folder?.$.facet?.value,
                        type: folder?.$.type?.value,
                        vituri: folder?.$.vituri?.value,
                        isExpandable: folder?.$.expandable?.value === "true",
                        hasChildrenOfSameFacet: folder?.$.hasChildrenOfSameFacet?.value,
                        whatisclicked: whatisclicked,
                    });
                }
            });

            return folders;
        } catch (error) {
            console.error("Failed to get virtual folders:", error);
            throw error;
        }
    }

    async getProgramSource(programName: string): Promise<string> {
        try {
            const path = `/programs/programs/${programName}/source/main`;
            const response = await this.request(path, "GET", undefined, {
                Accept: "text/plain",
                "Content-Type": "text/plain",
            });

            return response;
        } catch (error) {
            console.error("Failed to get program source:", error);
            throw error;
        }
    }

    async getClassSource(className: string): Promise<string> {
        try {
            const path = `/oo/classes/${className}/source/main`;
            const response = await this.request(path, "GET", undefined, {
                Accept: "text/plain",
                "Content-Type": "text/plain",
            });

            return response;
        } catch (error) {
            console.error("Failed to get class source:", error);
            throw error;
        }
    }
}

import * as vscode from 'vscode';
import * as jwt_decode from 'jwt-decode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as xml2js from 'xml2js';
import * as Constants from '../Constants/Constants';
import IOrganization from '../../Entities/IOrganization';
import { IAuthToken } from '../../Entities';

export default class EarlyBoundManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public registerCommands(): void {
        this.context.subscriptions.push(vscode.commands.registerCommand('cha0s2nd-vscode-cds.earlybound.generate', async () => { return this.generateEarlybounds(); }));
    }

    private async generateEarlybounds() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.find(wsf => wsf);
        const config = vscode.workspace.getConfiguration('cha0s2nd-vscode-cds.earlybound');

        const actionParams = [
            `/out:${path.join(workspaceFolder?.uri.fsPath || '', config.get<string>('actionFilename') || '')}`,
            `/generateActions`,
            `/codecustomization:DLaB.CrmSvcUtilExtensions.Action.CustomizeCodeDomService,DLaB.CrmSvcUtilExtensions`,
            `/codegenerationservice:DLaB.CrmSvcUtilExtensions.Action.CustomCodeGenerationService,DLaB.CrmSvcUtilExtensions`,
            `/codewriterfilter:DLaB.CrmSvcUtilExtensions.Action.CodeWriterFilterService,DLaB.CrmSvcUtilExtensions`,
            `/metadataproviderservice:DLaB.CrmSvcUtilExtensions.BaseMetadataProviderService,DLaB.CrmSvcUtilExtensions`,
        ];

        const entityParams = [
            `/out:${path.join(workspaceFolder?.uri.fsPath || '', config.get<string>('entityFilename') || '')}`,
            `/servicecontextname:${config.get<string>('serviceContextName') || 'CrmServiceContext'}`,
            `/codecustomization:DLaB.CrmSvcUtilExtensions.Entity.CustomizeCodeDomService,DLaB.CrmSvcUtilExtensions`,
            `/codegenerationservice:DLaB.CrmSvcUtilExtensions.Entity.CustomCodeGenerationService,DLaB.CrmSvcUtilExtensions`,
            `/codewriterfilter:DLaB.CrmSvcUtilExtensions.Entity.CodeWriterFilterService,DLaB.CrmSvcUtilExtensions`,
            `/namingservice:DLaB.CrmSvcUtilExtensions.NamingService,DLaB.CrmSvcUtilExtensions`,
            `/metadataproviderservice:DLaB.CrmSvcUtilExtensions.Entity.MetadataProviderService,DLaB.CrmSvcUtilExtensions`,
        ];

        const optionSetParams = [
            `/out:${path.join(workspaceFolder?.uri.fsPath || '', config.get<string>('optionSetFilename') || '')}`,
            `/codecustomization:DLaB.CrmSvcUtilExtensions.OptionSet.CustomizeCodeDomService,DLaB.CrmSvcUtilExtensions`,
            `/codegenerationservice:DLaB.CrmSvcUtilExtensions.OptionSet.CustomCodeGenerationService,DLaB.CrmSvcUtilExtensions`,
            `/codewriterfilter:DLaB.CrmSvcUtilExtensions.OptionSet.CodeWriterFilterService,DLaB.CrmSvcUtilExtensions`,
            `/namingservice:DLaB.CrmSvcUtilExtensions.NamingService,DLaB.CrmSvcUtilExtensions`,
            `/metadataproviderservice:DLaB.CrmSvcUtilExtensions.BaseMetadataProviderService,DLaB.CrmSvcUtilExtensions`,
        ];

        if (config.get<string>('namespace')) {
            const namespace = `/namespace:${config.get<string>('namespace')}`;

            actionParams.unshift(namespace);
            entityParams.unshift(namespace);
            optionSetParams.unshift(namespace);
        }

        await this.injectSettings(config, actionParams, entityParams, optionSetParams);

        if (config.get<boolean>('generateActions')) {
            await this.executeCrmSvcUtils(...actionParams);
        }

        if (config.get<boolean>('generateEntities')) {
            await this.executeCrmSvcUtils(...entityParams);
        }

        if (config.get<boolean>('generateOptionSets')) {
            await this.executeCrmSvcUtils(...optionSetParams);
        }
    }

    private async getConnection(): Promise<string> {
        const org = await vscode.commands.executeCommand<IOrganization>('cha0s2nd-vscode-cds.organization.get');
        const token = jwt_decode<any>((await vscode.commands.executeCommand<IAuthToken>('cha0s2nd-vscode-cds.auth.organizationToken.get', org))?.access_token || '');
        return `AuthType=OAuth;Url=${org?.url};AppId=${Constants.CLIENT_ID};RedirectUri=${Constants.REDIRECT_URL};Username=${token.unique_name};TokenCacheStorePath=${vscode.Uri.joinPath(this.context.extensionUri, 'token_cache').fsPath}`;
    }

    private async injectSettings(config: vscode.WorkspaceConfiguration, actionParams: string[], entityParams: string[], optionSetParams: string[]) {
        const configFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(this.context.workspaceState.get<string>('cha0s2nd-vscode-cds.dlabFolder') || '', '**/CrmSvcUtil.exe.config'));
        const configFile = configFiles.find(cf => cf);

        if (configFile) {
            const array = await vscode.workspace.fs.readFile(configFile);
            var buffer = Buffer.from(array);

            const configXml = await xml2js.parseStringPromise(buffer.toString());
            const settings = config.get<any>('generatorSettings') || {};

            configXml.configuration.appSettings = [{ add: [] }];

            // Actions don't generate without this
            configXml.configuration.appSettings[0].add.push({
                "$": {
                    "key": "ActionCommandLineText",
                    "value": `.\\CrmSvcUtils.exe ${actionParams.join(' ')}`
                }
            });

            configXml.configuration.appSettings[0].add.push({
                "$": {
                    "key": "EntityCommandLineText",
                    "value": `.\\CrmSvcUtils.exe ${entityParams.join(' ')}`
                }
            });

            configXml.configuration.appSettings[0].add.push({
                "$": {
                    "key": "OptionSetCommandLineText",
                    "value": `.\\CrmSvcUtils.exe ${optionSetParams.join(' ')}`
                }
            });

            for (let setting in settings) {
                let value = settings[setting];

                if (value instanceof Boolean) {
                    value = value ? 'True' : 'False';
                }

                if (value instanceof Array) {
                    value = value.join('|');
                }

                configXml.configuration.appSettings[0].add.push({
                    "$": {
                        "key": setting,
                        "value": value
                    }
                });
            }

            const builder = new xml2js.Builder();
            var xml = builder.buildObject(configXml);

            const newBuffer = Buffer.from(xml, 'utf-8');
            const newArray = new Uint8Array(newBuffer);
            vscode.workspace.fs.writeFile(configFile, newArray);
        }
    }

    private async getCrmSvcUtils(): Promise<vscode.Uri | undefined> {
        const utils = await vscode.workspace.findFiles(new vscode.RelativePattern(this.context.workspaceState.get<string>('cha0s2nd-vscode-cds.dlabFolder') || '', '**/CrmSvcUtil.exe'));


        if (utils.length < 1) {
            throw new Error('No CrmSvcUtil.exe file found, please ensure the required NuGet packages are installed.');
        }

        if (utils.length > 1) {
            throw new Error('Multiple CrmSvcUtil.exe files found, please ensure the required NuGet packages are installed correctly.');
        }

        for (let util of utils) {
            return util;
        }
    }

    private async executeCrmSvcUtils(...params: string[]): Promise<void> {
        return new Promise(async (resolve, reject) => {

            const crmSvcUtils = this.context.workspaceState.get<string>('cha0s2nd-vscode-cds.dlabFile');

            if (crmSvcUtils) {
                const output = vscode.window.createOutputChannel('Cha0s Data Tools: Early-bound');
                output.show();

                params.unshift(`/connectionstring:${await this.getConnection()}`);

                const process = child_process.spawn(crmSvcUtils, params, {
                    cwd: this.context.workspaceState.get<string>('cha0s2nd-vscode-cds.dlabFolder')
                });

                process.stdout.on('data', async (data) => {
                    output.append(data.toString());
                });

                process.stderr.on('data', async (data) => {
                    output.append(data.toString());
                });

                process.addListener('exit', async (code) => {
                    output.append(`Solution Packager exited with code '${code}'`);
                    resolve();
                });
            }
            else {
                throw new Error('Could not locate CrmSvcUtil.exe');
            }
        });
    }
}
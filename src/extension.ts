import * as vscode from 'vscode';
import AuthorizationManager from './Auth/AuthorizationManager';
import DependancyManager from './Core/Managers/DependancyManager';
import OrganizationManager from './Core/Managers/OrganizationManager';
import SolutionManager from './Core/Managers/SolutionManager';
import SpklManager from './Core/Managers/SpklManager';
import WebResourceManager from './Core/Managers/WebResourceManager';

export async function activate(context: vscode.ExtensionContext) {
  new DependancyManager(context).checkForCrmUtils();

  new AuthorizationManager(context).registerCommands();
  new OrganizationManager(context).registerCommands();
  new SolutionManager(context).registerCommands();
  new WebResourceManager(context).registerCommands();

  // Spkl (by Scott Durow) support: https://github.com/scottdurow/SparkleXrm/wiki/spkl
  new SpklManager(context).registerCommands();

  if (await context.workspaceState.get('cha0s2nd-vscode-cds.auth.token')) {
    if (await vscode.commands.executeCommand('cha0s2nd-vscode-cds.organization.get')) {
      await vscode.commands.executeCommand('cha0s2nd-vscode-cds.solution.get');
    }
  }
}

export function deactivate(context: vscode.ExtensionContext) {
}
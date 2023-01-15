import { ensureFile, writeFile } from 'fs-extra';
import { getRouteModuleFilePath, handleEslintFormat, INVALID_ROUTE_NAME } from '../shared';
import type { ContextOption, RouteModule } from '../types';

export function isDeleteWholeModule(deletes: string[], files: string[], moduleName: string) {
  const remains = files.filter(item => !deletes.includes(item));

  return remains.every(item => !item.includes(moduleName));
}

export async function generateRouteModuleCode(moduleName: string, module: RouteModule, options: ContextOption) {
  if (moduleName === INVALID_ROUTE_NAME) return;

  const filePath = getRouteModuleFilePath(moduleName, options);

  const code = `const ${moduleName}: ${options.routeModuleType} = ${JSON.stringify(
    module
  )};\n\nexport default ${moduleName};`;

  await ensureFile(filePath);

  await writeFile(filePath, code, 'utf-8');

  await handleEslintFormat(filePath);
}

export function removeRouteModule(routeName: string, children?: RouteModule[]) {
  if (!children || !children.length) return;
  const findIndex = children.findIndex(item => item.name === routeName);

  if (findIndex > -1) {
    children.splice(findIndex, 1);
  } else {
    children.forEach(item => {
      removeRouteModule(routeName, item.children);
    });
  }
}

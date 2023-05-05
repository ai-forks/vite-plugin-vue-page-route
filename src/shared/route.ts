import { writeFile, remove } from 'fs-extra';
import { access } from 'fs/promises';
import { red, bgRed, green, bgYellow, yellow } from 'kolorist';
import { transformFile } from '@swc/core';
import { SPLASH_MARK, PAGE_DEGREE_SPLIT_MARK, ROUTE_NAME_REG, INVALID_ROUTE_NAME, CAMEL_OR_PASCAL } from './constant';
import { getRelativePathOfGlob } from './glob';
import type {
  ContextOption,
  RouteConfig,
  RouteModule,
  RouteComponentType,
  FileWatcherDispatch,
  RouteFile
} from '../types';

// route config utils
function transformRouteName(glob: string, routeName: string, pageDir: string) {
  let name = routeName;

  const filePath = getRelativePathOfGlob(glob, pageDir);
  if (CAMEL_OR_PASCAL.test(routeName)) {
    let warning = `${bgYellow('RECOMMEND')} `;
    warning += yellow(`the filePath: ${filePath}`);
    warning += green(`\n it's recommended to use kebab-case name style`);
    warning += green(`\n example: good: user-info bad: userInfo, UserInfo`);
    // eslint-disable-next-line no-console
    console.info(warning);
  }

  if (!ROUTE_NAME_REG.test(name)) {
    name = INVALID_ROUTE_NAME;

    let error = `${bgRed('ERROR')} `;
    error += red(`the path is invalid: ${filePath} !\n`);
    error += red(`routeName: ${routeName} !`);
    error += green(
      `\n the directory name and file name can only include letter[a-zA-Z], number[0-9], underline[_] and dollar[$]`
    );
    // eslint-disable-next-line no-console
    console.error(error);
  }
  const acceptPath = getRouteFilePathByGlob(glob);
  if (!acceptPath.endsWith('index.vue')) {
    name = acceptPath
      .replace(/^\.\//, '')
      .replace(/\.vue$/, '')
      .replace(/\//g, '_');
    name = name.replace(/\[[a-z0-9_-]+\]/i, v => {
      const n = v.replace(/^\[+/, ':').replace(/\]+$/, '');
      return n;
    });
  }
  // console.info('===>', routeName, name, acceptPath);
  return name;
}

export function getRouteNameByGlob(glob: string, pageDir: string) {
  const globSplits = glob.split(SPLASH_MARK);

  const isFile = glob.includes('.');
  const sliceLength = isFile ? globSplits.length - 1 : globSplits.length;

  const routeName = globSplits.splice(0, sliceLength).join(PAGE_DEGREE_SPLIT_MARK);

  return transformRouteName(glob, routeName, pageDir);
}

export function getAllRouteNames(routeName: string) {
  const names = routeName.split(PAGE_DEGREE_SPLIT_MARK);

  const namesWithParent: string[] = [];

  for (let i = 1; i <= names.length; i += 1) {
    const parentName = names.slice(0, i).reduce((pre, cur) => pre + PAGE_DEGREE_SPLIT_MARK + cur);
    namesWithParent.push(parentName);
  }

  return namesWithParent;
}

export function getRouteFilePathByGlob(glob: string) {
  return `./${glob}`;
}

export function getRouteNameByGlobWithTransformer(glob: string, options: ContextOption) {
  const routeName = getRouteNameByGlob(glob, options.pageDir);
  return options.routeNameTansformer(routeName);
}

export function getRouteConfigByGlobs(globs: string[], options: ContextOption) {
  const config: RouteConfig = {
    names: [],
    files: []
  };

  globs.sort().forEach(glob => {
    const filePath = getRouteFilePathByGlob(glob);
    const routeName = getRouteNameByGlob(glob, options.pageDir);
    const names = getAllRouteNames(routeName);
    config.names.push(...names);

    config.files.push({ name: routeName, path: filePath });
  });

  config.names = Array.from(new Set([...config.names]))
    .map(name => options.routeNameTansformer(name))
    .filter(name => Boolean(name) && name !== INVALID_ROUTE_NAME);

  config.files = config.files
    .map(({ name, path }) => ({ name: options.routeNameTansformer(name), path }))
    .filter(item => item.name !== INVALID_ROUTE_NAME);

  return config;
}

// route module utils
interface RouteModuleConfig {
  component: RouteComponentType;
  hasSingleLayout: boolean;
}
function getRouteModuleConfig(index: number, length: number) {
  const actions: [boolean, RouteModuleConfig][] = [
    [length === 1, { component: 'self', hasSingleLayout: true }],
    [length === 2 && index === 0, { component: 'basic', hasSingleLayout: false }],
    [length === 2 && index === 1, { component: 'self', hasSingleLayout: false }],
    [length >= 3 && index === 0, { component: 'basic', hasSingleLayout: false }],
    [length >= 3 && index === length - 1, { component: 'self', hasSingleLayout: false }],
    [true, { component: 'multi', hasSingleLayout: false }]
  ];

  const config: RouteModuleConfig = {
    component: 'self',
    hasSingleLayout: false
  };

  const findItem = actions.find(([condition]) => condition);

  return findItem?.[1] || config;
}

export function getRoutePathFromName(routeName: string) {
  const PATH_SPLIT_MARK = '/';

  return PATH_SPLIT_MARK + routeName.replace(new RegExp(`${PAGE_DEGREE_SPLIT_MARK}`, 'g'), PATH_SPLIT_MARK);
}

export function getRouteModuleNameByRouteName(routeName: string) {
  const routeNames = getAllRouteNames(routeName);

  if (!routeNames.length) {
    throw new Error(`路由名称不正确!`);
  }

  return routeNames[0];
}

export function getRouteModuleNameByGlob(glob: string, options: ContextOption) {
  const routeName = getRouteNameByGlobWithTransformer(glob, options);

  const moduleName = getRouteModuleNameByRouteName(routeName);

  return moduleName;
}

export function checkIsValidRouteModule(data: any): data is RouteModule {
  const isObject = Object.prototype.toString.call(data) === '[object Object]';

  return isObject && data.name && data.path && data.component && data.meta;
}

function getSingleRouteModulesFromRouteName(routeName: string) {
  const routeNames = getAllRouteNames(routeName);

  const modules: RouteModule[] = routeNames.map((item, index) => {
    const config = getRouteModuleConfig(index, routeNames.length);

    const module: RouteModule = {
      name: item,
      path: getRoutePathFromName(item),
      component: config.component,
      meta: {
        title: item,
        icon: 'mdi:menu'
      }
    };

    if (config.hasSingleLayout) {
      module.meta.singleLayout = 'basic';
    }

    return module;
  });

  return modules;
}

export function getSingleRouteModulesFromGlob(glob: string, options: ContextOption) {
  const routeName = getRouteNameByGlobWithTransformer(glob, options);
  const modules = getSingleRouteModulesFromRouteName(routeName);

  return modules;
}

function getSingleRouteModulesWithChildren(singleModules: RouteModule[]): RouteModule | null {
  const reversedModules = [...singleModules].reverse();

  reversedModules.forEach((module, index) => {
    if (index < reversedModules.length - 1) {
      reversedModules[index + 1].children = [module];
    }
  });

  return reversedModules[reversedModules.length - 1] || null;
}

function recurseMergeModule(modules: RouteModule[], singleModules: RouteModule[], singleRouteLevel: number) {
  if (!singleModules.length) return;

  const currentLevelRouteModule = singleModules[singleRouteLevel];

  const findIndex = modules.findIndex(module => module.name === currentLevelRouteModule.name);

  if (findIndex > -1) {
    const findModule = modules[findIndex];

    if (!findModule.children) {
      findModule.children = [];
    }

    recurseMergeModule(findModule.children!, singleModules, singleRouteLevel + 1);
  } else {
    const pushModule = getSingleRouteModulesWithChildren(singleModules.slice(singleRouteLevel));
    if (pushModule) {
      modules.push(pushModule);
    }
  }
}

export function mergeFirstDegreeRouteModule(firstDegreeRouteModule: RouteModule, singleModules: RouteModule[]) {
  if (!firstDegreeRouteModule.children) {
    firstDegreeRouteModule.children = [];
  }

  recurseMergeModule(firstDegreeRouteModule.children!, singleModules, 1);
}

export function getTotalRouteModuleFromNames(routeNames: string[]) {
  let module: RouteModule;

  routeNames.forEach((routeName, index) => {
    const modules = getSingleRouteModulesFromRouteName(routeName);

    const [firstModule] = modules;

    if (index === 0) {
      module = firstModule;
    }

    if (firstModule.name === module.name && modules.length > 1) {
      mergeFirstDegreeRouteModule(module, modules);
    }
  });

  return module!;
}

export function getRouteModuleFilePath(moduleName: string, options: ContextOption) {
  const { rootDir, routeModuleDir, routeModuleExt } = options;

  const filePath = `${rootDir}/${routeModuleDir}/${moduleName}.${routeModuleExt}`;

  return filePath;
}

export async function getIsRouteModuleFileExist(moduleName: string, options: ContextOption) {
  const filePath = getRouteModuleFilePath(moduleName, options);

  let exist = false;
  try {
    await access(filePath);
    exist = true;
  } catch {}

  return {
    exist,
    filePath
  };
}

function getTheSmallLengthOfStrArr(arr: string[]) {
  let name: string = arr[0];

  arr.forEach(item => {
    if (name === null) {
      name = item;
    } else {
      name = item.length < name.length ? item : name;
    }
  });

  return name;
}

// eslint-disable-next-line max-params
export async function getRouteModuleWhetherFileExist(params: {
  moduleName: string;
  existModuleName: string;
  routeConfig: RouteConfig;
  options: ContextOption;
  existCallback: (module: RouteModule, filePath: string) => Promise<RouteModule | null>;
}) {
  const { moduleName, existModuleName, routeConfig, options, existCallback } = params;

  const { exist, filePath } = await getIsRouteModuleFileExist(existModuleName, options);

  let module: RouteModule | null;

  try {
    if (exist) {
      const importModule = await getRouteModuleFromFile(filePath, existModuleName, options);

      if (checkIsValidRouteModule(importModule)) {
        module = await existCallback(importModule, filePath);
      } else {
        throw Error('invalid route module!');
      }
    } else {
      throw Error('not exist module file!');
    }
  } catch (error) {
    const routeNames = routeConfig.files.filter(item => item.name.includes(moduleName)).map(item => item.name);

    module = getTotalRouteModuleFromNames(routeNames);
  }

  return module;
}

export function recurseRemoveModuleByName(module: RouteModule, routeName: string) {
  if (!module.children) return;

  module.children = module.children.filter(item => item.name !== routeName);

  module.children.forEach(item => {
    if (routeName.includes(item.name)) {
      recurseRemoveModuleByName(item, routeName);
    }
  });
}

export function recurseRemoveModuleByNames(module: RouteModule, routeNames: string[]) {
  if (!routeNames.length) return;

  routeNames.forEach(item => {
    recurseRemoveModuleByName(module, item);
  });
}

// FSWatcher hooks utils

export function getRenamedDirConfig(dispatchs: FileWatcherDispatch[], options: ContextOption) {
  const unlinkDirs: string[] = [];
  const addDirs: string[] = [];

  dispatchs.forEach(dispatch => {
    if (dispatch.event === 'unlinkDir') {
      unlinkDirs.push(dispatch.path);
    }
    if (dispatch.event === 'addDir') {
      addDirs.push(dispatch.path);
    }
  });

  const oldDir = getTheSmallLengthOfStrArr(unlinkDirs);
  const newDir = getTheSmallLengthOfStrArr(addDirs);

  const oldRouteName = getRouteNameByGlobWithTransformer(oldDir, options);
  const oldRouteFilePath = getRouteFilePathByGlob(oldDir);

  const newRouteName = getRouteNameByGlobWithTransformer(newDir, options);
  const newRouteFilePath = getRouteFilePathByGlob(newDir);

  return {
    oldRouteName,
    newRouteName,
    oldRouteFilePath,
    newRouteFilePath
  };
}

export function getDelDirConfig(dispatchs: FileWatcherDispatch[], options: ContextOption) {
  const unlinkDirs: string[] = [];

  dispatchs.forEach(dispatch => {
    if (dispatch.event === 'unlinkDir') {
      unlinkDirs.push(dispatch.path);
    }
  });

  const delDir = getTheSmallLengthOfStrArr(unlinkDirs);

  const delRouteName = getRouteNameByGlobWithTransformer(delDir, options);

  return {
    delRouteName
  };
}

export function getAddDirConfig(dispatchs: FileWatcherDispatch[], options: ContextOption) {
  const globs: string[] = [];

  dispatchs.forEach(dispatch => {
    if (dispatch.event === 'add') {
      globs.push(dispatch.path);
    }
  });

  const config = getRouteConfigByGlobs(globs, options);

  return config;
}

export function getDelFileConfig(dispatchs: FileWatcherDispatch[], options: ContextOption) {
  const delRouteNames: string[] = [];

  dispatchs.forEach(dispatch => {
    if (dispatch.event === 'unlink') {
      const name = getRouteNameByGlobWithTransformer(dispatch.path, options);
      delRouteNames.push(name);
    }
  });

  return {
    delRouteNames
  };
}

export function getAddFileConfig(dispatchs: FileWatcherDispatch[], options: ContextOption) {
  const addRouteNames: string[] = [];
  const addRouteFiles: RouteFile[] = [];

  dispatchs.forEach(dispatch => {
    if (dispatch.event === 'add') {
      const name = getRouteNameByGlobWithTransformer(dispatch.path, options);
      addRouteNames.push(name);

      const path = getRouteFilePathByGlob(dispatch.path);
      addRouteFiles.push({ name, path });
    }
  });

  const config: RouteConfig = {
    names: addRouteNames,
    files: addRouteFiles
  };

  return config;
}

async function getRouteModuleFromFile(filePath: string, moduleName: string, options: ContextOption) {
  const transformedFilePath = filePath.replace(`${moduleName}.${options.routeModuleExt}`, `${moduleName}-swc.js`);
  const { code } = await transformFile(filePath, { filename: transformedFilePath, module: { type: 'commonjs' } });

  if (code) {
    await writeFile(transformedFilePath, code, 'utf-8');
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: importModule } = require(transformedFilePath);

  await remove(transformedFilePath);

  return importModule as RouteModule;
}

export function transformModuleNameToVariable(name: string) {
  return name.replace(/-(\w)/g, (_, match: string) => match.toUpperCase());
}

/**
 * FeHelper 右键菜单管理
 * @type {{manage}}
 * @author zhaoxianlie
 */

import CrxDownloader from './crx-download.js';
import Awesome from './awesome.js';
import toolMap from './tools.js';
import Settings from '../options/settings.js';

export default (function () {

    let FeJson = {
        contextMenuId:"fhm_main",
        // 全局监听器映射表，存储菜单ID到点击处理函数的映射
        menuClickHandlers: {}
    };

    console.log('[FeHelper-Menu] Menu模块初始化');

    // 邮件菜单配置项
    let defaultMenuOptions = {
        'download-crx': {
            icon: '♥',
            text: '插件下载分享',
            onClick: function (info, tab) {
                console.log('[FeHelper-Menu] 点击菜单: 插件下载分享', { tabId: tab.id });
                CrxDownloader.downloadCrx(tab);
            }
        },
        'fehelper-setting': {
            icon: '❂',
            text: 'FeHelper设置',
            onClick: function (info, tab) {
                console.log('[FeHelper-Menu] 点击菜单: FeHelper设置', { tabId: tab.id });
                chrome.runtime.openOptionsPage();
            }
        }
    };

    // 初始化菜单配置
    let _initMenuOptions = (() => {
        console.log('[FeHelper-Menu] 初始化菜单配置开始');
        
        Object.keys(toolMap).forEach(tool => {
            // context-menu
            switch (tool) {
                case 'json-format':
                    toolMap[tool].menuConfig[0].onClick = function (info, tab) {
                        console.log('[FeHelper-Menu] 点击菜单: JSON格式化', { tabId: tab.id, selectionText: info.selectionText?.length > 0 ? '有选中内容' : '无选中内容' });
                        chrome.scripting.executeScript({
                            target: {tabId:tab.id,allFrames:false},
                            args: [info.selectionText || ''],
                            func: (text) => text
                        }, resp => {
                            console.log('[FeHelper-Menu] JSON格式化脚本执行完成', { hasResult: !!resp[0].result });
                            chrome.DynamicToolRunner({
                                tool, withContent: resp[0].result
                            });
                        });
                    };
                    break;

                case 'code-beautify':
                case 'en-decode':
                    toolMap[tool].menuConfig[0].onClick = function (info, tab) {
                        console.log(`[FeHelper-Menu] 点击菜单: ${tool === 'code-beautify' ? '代码美化' : '信息编码转换'}`, { tabId: tab.id });
                        chrome.scripting.executeScript({
                            target: {tabId:tab.id,allFrames:false},
                            args: [info.linkUrl || info.srcUrl || info.selectionText || info.pageUrl || ''],
                            func: (text) => text
                        }, resp => {
                            console.log(`[FeHelper-Menu] ${tool}脚本执行完成`, { hasResult: !!resp[0].result });
                            chrome.DynamicToolRunner({
                                tool, withContent: resp[0].result
                            });
                        });
                    };
                    break;

                case 'qr-code':
                    toolMap[tool].menuConfig[0].onClick = function (info, tab) {
                        console.log('[FeHelper-Menu] 点击菜单: 二维码生成器', { tabId: tab.id });
                        chrome.scripting.executeScript({
                            target: {tabId:tab.id,allFrames:false},
                            args: [info.linkUrl || info.srcUrl || info.selectionText || info.pageUrl || tab.url || ''],
                            func: (text) => text
                        }, resp => {
                            console.log('[FeHelper-Menu] 二维码生成器脚本执行完成', { hasResult: !!resp[0].result });
                            chrome.DynamicToolRunner({
                                tool, withContent: resp[0].result
                            });
                        });
                    };
                    toolMap[tool].menuConfig[1].onClick = function (info, tab) {
                        console.log('[FeHelper-Menu] 点击菜单: 二维码解码器', { tabId: tab.id, hasSrcUrl: !!info.srcUrl });
                        chrome.scripting.executeScript({
                            target: {tabId:tab.id,allFrames:false},
                            args: [info.srcUrl || ''],
                            func: (text) => {
                                try {
                                    if (typeof window.qrcodeContentScript === 'function') {
                                        let qrcode = window.qrcodeContentScript();
                                        if (typeof qrcode.decode === 'function') {
                                            qrcode.decode(text);
                                            return 1;
                                        }
                                    }
                                } catch (e) {
                                    console.error('[FeHelper-Menu] 二维码解码失败', e);
                                    return 0;
                                }
                            }
                        });
                    };
                    break;

                default:
                    toolMap[tool].menuConfig[0].onClick = function (info, tab) {
                        console.log(`[FeHelper-Menu] 点击菜单: ${toolMap[tool].name}`, { tabId: tab.id, toolName: tool });
                        chrome.DynamicToolRunner({
                            tool, withContent: tool === 'image-base64' ? info.srcUrl : ''
                        })
                    };
                    break;
            }
        });
        
        console.log('[FeHelper-Menu] 初始化菜单配置完成，共处理', Object.keys(toolMap).length, '个工具');
    })();

    // 全局菜单点击事件监听器
    let _globalMenuClickListener = function(info, tab) {
        console.log('[FeHelper-Menu] 全局菜单点击事件触发', { menuItemId: info.menuItemId, tabId: tab.id, hasHandler: !!FeJson.menuClickHandlers[info.menuItemId] });
        if (FeJson.menuClickHandlers[info.menuItemId]) {
            console.log('[FeHelper-Menu] 执行菜单处理函数', { menuItemId: info.menuItemId });
            FeJson.menuClickHandlers[info.menuItemId](info, tab);
        } else {
            console.warn('[FeHelper-Menu] 未找到菜单处理函数', { menuItemId: info.menuItemId, availableHandlers: Object.keys(FeJson.menuClickHandlers) });
            // 尝试重新构建菜单
            console.log('[FeHelper-Menu] 尝试重新构建菜单...');
            _initMenus();
        }
    };

    // 注册全局监听器（只注册一次）
    if (!chrome.contextMenus.onClicked.hasListener(_globalMenuClickListener)) {
        console.log('[FeHelper-Menu] 注册全局菜单点击监听器');
        chrome.contextMenus.onClicked.addListener(_globalMenuClickListener);
    } else {
        console.log('[FeHelper-Menu] 全局菜单点击监听器已存在，跳过注册');
    }

    /**
     * 创建一个menu 菜单
     * @param toolName
     * @param menuList
     * @returns {boolean}
     * @private
     */
    let _createItem = (toolName, menuList) => {
        console.log(`[FeHelper-Menu] 创建菜单: ${toolName}`, { menuListLength: menuList?.length || 0 });
        menuList && menuList.forEach && menuList.forEach(menu => {

            // 确保每次创建出来的是一个新的主菜单，防止onClick事件冲突
            let menuItemId = 'fhm_c' + escape(menu.text).replace(/\W/g,'') + new Date*1 + Math.floor(Math.random()*1000);
            console.log(`[FeHelper-Menu] 创建菜单项: ${menu.text}`, { menuItemId, toolName });

            chrome.contextMenus.create({
                id: menuItemId,
                title: menu.icon + '  ' + menu.text,
                contexts: menu.contexts || ['all'],
                parentId: FeJson.contextMenuId
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[FeHelper-Menu] 创建菜单失败:', chrome.runtime.lastError.message, { menuItemId, toolName, menu });
                } else {
                    console.log(`[FeHelper-Menu] 菜单项创建成功: ${menu.text}`, { menuItemId });
                    // 将菜单ID和点击处理函数存储到映射表中
                    FeJson.menuClickHandlers[menuItemId] = menu.onClick || function() {
                        chrome.DynamicToolRunner({ tool: toolName });
                    };
                    console.log(`[FeHelper-Menu] 菜单项处理函数注册成功`, { menuItemId, handlerType: menu.onClick ? '自定义处理函数' : '默认处理函数' });
                }
            });
        });
    };


    /**
     * 绘制一条分割线
     * @private
     */
    let _createSeparator = function () {
        let separatorId = 'fhm_s' + Math.ceil(Math.random()*10e9);
        console.log(`[FeHelper-Menu] 创建分割线`, { separatorId });
        chrome.contextMenus.create({
            id: separatorId,
            type: 'separator',
            parentId: FeJson.contextMenuId
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('[FeHelper-Menu] 创建分割线失败:', chrome.runtime.lastError.message, { separatorId });
            } else {
                console.log(`[FeHelper-Menu] 分割线创建成功`, { separatorId });
            }
        });
    };

    /**
     * 创建扩展专属的右键菜单
     */
    let _initMenus = function () {
        console.log('[FeHelper-Menu] 开始初始化菜单...');
        // 清空监听器映射表
        FeJson.menuClickHandlers = {};
        console.log('[FeHelper-Menu] 清空监听器映射表');
        
        _removeContextMenu(() => {
            console.log('[FeHelper-Menu] 旧菜单已移除，开始创建新菜单');
            
            // 先创建主菜单，确保父菜单存在
            chrome.contextMenus.create({
                id: FeJson.contextMenuId ,
                title: "FeHelper",
                contexts: ['page', 'selection', 'editable', 'link', 'image'],
                documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
            }, (id) => {
                if (chrome.runtime.lastError) {
                    console.error('[FeHelper-Menu] 创建主菜单失败:', chrome.runtime.lastError.message);
                    return; // 主菜单创建失败，终止后续操作
                }
                
                console.log('[FeHelper-Menu] 主菜单创建成功', { mainMenuId: FeJson.contextMenuId });
                
                // 主菜单创建成功后，再创建其他菜单
                Promise.all([
                    // 绘制用户安装的菜单
                    Awesome.getInstalledTools().then(tools => {
                        console.log('[FeHelper-Menu] 获取已安装工具成功', { toolCount: Object.keys(tools).length });
                        let allMenus = Object.keys(tools).filter(tool => tools[tool].installed && tools[tool].menu);
                        let onlineTools = allMenus.filter(tool => tool !== 'devtools' && !tools[tool].hasOwnProperty('_devTool'));
                        let devTools = allMenus.filter(tool => tool === 'devtools' || tools[tool].hasOwnProperty('_devTool'));

                        console.log('[FeHelper-Menu] 菜单分类统计', { 
                            allMenus: allMenus.length, 
                            onlineTools: onlineTools.length, 
                            devTools: devTools.length 
                        });

                        // 绘制FH提供的工具菜单
                        console.log('[FeHelper-Menu] 开始创建在线工具菜单');
                        onlineTools.forEach(tool => _createItem(tool, tools[tool].menuConfig));
                        
                        // 如果有本地工具的菜单需要绘制，则需要加一条分割线
                        if (devTools.length > 0) {
                            _createSeparator();
                            // 绘制本地工具的菜单
                            console.log('[FeHelper-Menu] 开始创建本地工具菜单');
                            devTools.forEach(tool => {
                                // 说明是自定义工具 构造menuConfig
                                if(!tools[tool].menuConfig) {
                                    console.log(`[FeHelper-Menu] 为自定义工具 ${tool} 构造菜单配置`);
                                    tools[tool].menuConfig = [{
                                        icon: tools[tool].icon,
                                        text: tools[tool].name,
                                        onClick: (info, tab) => {
                                            console.log(`[FeHelper-Menu] 点击自定义工具菜单: ${tools[tool].name}`, { tabId: tab.id });
                                            chrome.DynamicToolRunner({
                                                page: 'dynamic',
                                                noPage: !!tools[tool].noPage,
                                                query: `tool=${tool}`
                                            });
                                            !!tools[tool].noPage && setTimeout(window.close, 200);
                                        }
                                    }];
                                }
                                _createItem(tool, tools[tool].menuConfig)
                            });
                        }
                        
                        console.log('[FeHelper-Menu] 工具菜单创建完成，当前映射表大小:', Object.keys(FeJson.menuClickHandlers).length);
                        return tools;
                    }),
                    
                    // 获取系统菜单配置
                    (async () => {
                        let sysMenu = ['download-crx', 'fehelper-setting'];
                        console.log('[FeHelper-Menu] 开始获取系统菜单配置');
                        let arrPromises = sysMenu.map(menu => Awesome.menuMgr(menu, 'get'));
                        let values = await Promise.all(arrPromises);
                        console.log('[FeHelper-Menu] 系统菜单配置获取完成', { values });
                        return { sysMenu, values };
                    })()
                ]).then(([tools, sysMenuConfig]) => {
                    // 绘制两个系统提供的菜单，放到最后
                    let { sysMenu, values } = sysMenuConfig;
                    let needDraw = String(values[0]) === '1' || String(values[1]) !== '0';
                    console.log('[FeHelper-Menu] 系统菜单配置', { values, needDraw });

                    // 绘制一条分割线
                    _createSeparator();

                    // 绘制菜单
                    if (String(values[0]) === '1') {
                        _createItem(sysMenu[0], [defaultMenuOptions[sysMenu[0]]]);
                    }
                    if (String(values[1]) !== '0') {
                        _createItem(sysMenu[1], [defaultMenuOptions[sysMenu[1]]]);
                    }
                    
                    console.log('[FeHelper-Menu] 系统菜单创建完成，最终映射表大小:', Object.keys(FeJson.menuClickHandlers).length);
                    console.log('[FeHelper-Menu] 所有菜单创建完成 - 菜单初始化结束');
                });
            });
        });
    };

    /**
     * 移除扩展专属的右键菜单
     */
    let _removeContextMenu = function (callback) {
        console.log('[FeHelper-Menu] 开始移除所有菜单');
        chrome.contextMenus.removeAll(() => {
            console.log('[FeHelper-Menu] 所有菜单已移除');
            callback && callback();
        });
    };

    /**
     * 创建或移除扩展专属的右键菜单
     */
    let _createOrRemoveContextMenu = function () {
        console.log('[FeHelper-Menu] 开始检查菜单配置');
        Settings.getOptions((opts) => {
            console.log('[FeHelper-Menu] 获取菜单配置', { OPT_ITEM_CONTEXTMENUS: opts['OPT_ITEM_CONTEXTMENUS'] });
            if (String(opts['OPT_ITEM_CONTEXTMENUS']) !== 'false') {
                _initMenus();
            } else {
                console.log('[FeHelper-Menu] 菜单功能已禁用，移除所有菜单');
                _removeContextMenu();
            }
        });
    };

    return {
        rebuild: _createOrRemoveContextMenu
    };
})();

// extension.js
const vscode = require('vscode');

// 插件核心配置常量
const CONFIG_NAMESPACE = "phpSnippetHighlighter";
const DEFAULT_BG_COLOR = "rgba(50, 120, 200, 0.6)";
const DEFAULT_SUPPORTED_LANGUAGES = ["php", "html", "blade", "phtml"];

/**
 * 激活扩展时调用
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let activeEditor = vscode.window.activeTextEditor;
    let isHighlightEnabled = true;
    let decorationType = null;
    let statusBarItem = null;
    let debounceTimer = null;

    // ========== 工具函数 ==========
    // 安全读取配置（增加类型校验）
    const getConfig = (key) => {
        const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
        switch (key) {
            case "backgroundColor":
                const bgColor = config.get(key, DEFAULT_BG_COLOR);
                return typeof bgColor === "string" ? bgColor : DEFAULT_BG_COLOR;
            case "supportedLanguages":
                const langs = config.get(key, DEFAULT_SUPPORTED_LANGUAGES);
                return Array.isArray(langs) ? langs : DEFAULT_SUPPORTED_LANGUAGES;
            default:
                return config.get(key);
        }
    };

    // 验证颜色格式（基础校验）
    const isValidColor = (color) => {
        const colorRegex = /^(rgba?\(\d+,\s*\d+,\s*\d+(,\s*[0-1](\.\d+)?)\)?|#([0-9a-fA-F]{3}){1,2}|[a-zA-Z]+)$/;
        return colorRegex.test(color.trim());
    };

    // ========== 核心功能 ==========
    // 初始化装饰器（增加错误处理）
    const initDecoration = () => {
        try {
            if (decorationType) decorationType.dispose();
            
            let bgColor = getConfig("backgroundColor");
            // 颜色不合法时使用默认值
            if (!isValidColor(bgColor)) {
                bgColor = DEFAULT_BG_COLOR;
                vscode.window.showWarningMessage(
                    `PHP高亮：配置的背景色格式不合法，已自动恢复为默认值\n错误值：${getConfig("backgroundColor")}`
                );
            }

            decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: bgColor,
                borderLeft: "1px solid rgba(50, 120, 200, 0.3)",
                isWholeLine: false
            });
            context.subscriptions.push(decorationType);
        } catch (error) {
            vscode.window.showErrorMessage(`PHP高亮初始化失败：${error.message}`);
            console.error("PHP Highlighter init error:", error);
        }
    };

    // 初始化状态栏
    const initStatusBar = () => {
        if (statusBarItem) statusBarItem.dispose();
        
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = "php-snippet-highlighter.togglePHPBackground";
        statusBarItem.tooltip = "点击切换PHP代码块高亮状态";
        statusBarItem.text = isHighlightEnabled ? "🟢 PHP高亮" : "🔴 PHP高亮";
        statusBarItem.color = isHighlightEnabled ? "#4CAF50" : "#F44336";
        statusBarItem.show();
        
        context.subscriptions.push(statusBarItem);
    };

    // 更新状态栏
    const updateStatusBar = () => {
        if (!statusBarItem) return;
        statusBarItem.text = isHighlightEnabled ? "🟢 PHP高亮" : "🔴 PHP高亮";
        statusBarItem.color = isHighlightEnabled ? "#4CAF50" : "#F44336";
    };

    // 核心：PHP块高亮逻辑
    const highlightPHPBlocks = () => {
        if (!activeEditor || !decorationType || !isHighlightEnabled) {
            activeEditor?.setDecorations(decorationType, []);
            return;
        }

        const document = activeEditor.document;
        const currentLang = document.languageId;
        const supportedLangs = getConfig("supportedLanguages");
        
        if (!supportedLangs.includes(currentLang)) {
            activeEditor.setDecorations(decorationType, []);
            return;
        }

        try {
            const text = document.getText();
            const decorations = [];
            const phpBlockRegex = /<\?(php)?[\s\S]*?\?>/gi;
            let match;

            while ((match = phpBlockRegex.exec(text))) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: `PHP代码块 (点击状态栏切换高亮)`
                });
            }

            activeEditor.setDecorations(decorationType, decorations);
        } catch (error) {
            console.error("PHP Highlighter highlight error:", error);
        }
    };

    // ========== 命令注册 ==========
    // 切换高亮开关
    const toggleCmd = vscode.commands.registerCommand('php-snippet-highlighter.togglePHPBackground', () => {
        isHighlightEnabled = !isHighlightEnabled;
        updateStatusBar();
        highlightPHPBlocks();
        vscode.window.showInformationMessage(`PHP高亮已${isHighlightEnabled ? "启用" : "禁用"}`);
    });

    // 快速修改背景色
    const changeColorCmd = vscode.commands.registerCommand('php-snippet-highlighter.changePHPBackground', async () => {
        const currentColor = getConfig("backgroundColor");
        const newColor = await vscode.window.showInputBox({
            prompt: "输入PHP代码块背景色（支持rgba/hex/rgb）",
            value: currentColor,
            placeHolder: "例如：rgba(50, 120, 200, 0.15) 或 #f0f8ff",
            validateInput: (value) => {
                if (!value) return "颜色值不能为空";
                if (!isValidColor(value)) return "颜色格式不合法，请检查";
                return null;
            }
        });

        if (newColor) {
            await vscode.workspace.getConfiguration(CONFIG_NAMESPACE).update(
                "backgroundColor",
                newColor,
                vscode.ConfigurationTarget.Global
            );
            initDecoration();
            highlightPHPBlocks();
            vscode.window.showInformationMessage(`PHP高亮背景色已更新为：${newColor}`);
        }
    });

    // ========== 事件监听 ==========
    // 配置变更监听
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
            initDecoration();
            highlightPHPBlocks();
        }
    });

    // 编辑器切换监听
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        activeEditor = editor;
        if (editor) highlightPHPBlocks();
    });

    // 文档修改监听（防抖）
    const documentChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
        if (activeEditor && e.document === activeEditor.document) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                highlightPHPBlocks();
            }, 100);
        }
    });

    // ========== 初始化 ==========
    initDecoration();
    initStatusBar();
    if (activeEditor) highlightPHPBlocks();

    // ========== 资源回收 ==========
    context.subscriptions.push(
        toggleCmd,
        changeColorCmd,
        configChangeListener,
        editorChangeListener,
        documentChangeListener,
        {
            dispose: () => {
                if (statusBarItem) statusBarItem.dispose();
                if (decorationType) decorationType.dispose();
                clearTimeout(debounceTimer);
            }
        }
    );
}

/**
 * 停用扩展时调用
 */
function deactivate() {
    // 清理资源
}

module.exports = {
    activate,
    deactivate
};
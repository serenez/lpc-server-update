import type { CompilerDiagnosticSeverity } from './compilerDiagnostics';

export const COMPILER_DIAGNOSTIC_MESSAGE_LANGUAGES = ['dual', 'en', 'zh'] as const;

export type CompilerDiagnosticMessageLanguage =
    typeof COMPILER_DIAGNOSTIC_MESSAGE_LANGUAGES[number];

type TranslationRule = {
    pattern: RegExp;
    translate: (match: RegExpMatchArray) => string;
};

const EXACT_TRANSLATIONS = new Map<string, string>([
    ['Extra \';\'. Ignored.', '多余的分号，已忽略'],
    ['Missing type for global variable declaration', '全局变量声明缺少类型'],
    ['modifier list may not be empty.', '修饰符列表不能为空'],
    ['Illegal modifier \'varargs\' in global modifier list.', '全局修饰符列表中不允许使用 varargs'],
    ['Illegal to declare class member of type void.', '类成员不能声明为 void 类型'],
    ['End of functional not found', '未找到 functional 的结束位置'],
    ['Illegal to use local variable in functional.', 'functional 中不允许直接使用局部变量'],
    ['Illegal to use local variable in a functional.', 'functional 中不允许直接使用局部变量'],
    ['Missing type for argument', '参数声明缺少类型'],
    ['Variable to hold remainder of args may not be a reference', '接收剩余参数的变量不能是引用'],
    ['Variable to hold remainder of arguments should be an array.', '接收剩余参数的变量应该是数组'],
    ['argument of type void must be the only argument.', 'void 类型参数必须是唯一参数'],
    ['Illegal to declare varargs variable.', '变量不能声明为 varargs'],
    ['Only \'=\' is legal in initializers.', '初始化表达式中只允许使用 ='],
    ['Only \'=\' is allowed in initializers.', '初始化表达式中只允许使用 ='],
    ['Illegal to declare local variable as reference', '局部变量不能声明为引用'],
    ['Cannot break out of catch { } or time_expression { }', '不能从 catch { } 或 time_expression { } 中 break'],
    ['break statement outside loop', 'break 语句只能出现在循环内部'],
    ['Cannot continue out of catch { } or time_expression { }', '不能从 catch { } 或 time_expression { } 中 continue'],
    ['continue statement outside loop', 'continue 语句只能出现在循环内部'],
    ['Mapping key may not be a reference in foreach()', 'foreach() 中的 mapping key 不能是引用'],
    ['need case statements in switch/case, not just default:', 'switch/case 不能只有 default，至少需要一个 case'],
    ['String case labels not allowed as range bounds', '字符串 case 标签不能作为范围边界'],
    ['Duplicate default', '重复定义了 default 分支'],
    ['Mixed case label list not allowed', '不允许混用不同类型的 case 标签列表'],
    ['ref illegal outside function argument list', 'ref 只能在函数参数列表中使用'],
    ['Illegal to make reference to range', '不能对区间表达式创建引用'],
    ['unknown lvalue kind', '未知的左值类型'],
    ['Illegal LHS', '赋值左侧表达式非法'],
    ['bitwise operation on boolean values.', '对布尔值执行了位运算'],
    ['Bad arguments to \'+\' (unknown vs unknown)', '加号两侧参数类型都无法确定'],
    ['Bad right argument to \'+\' (function)', '加号右侧不接受 function 类型'],
    ['Bad left argument to \'+\' (function)', '加号左侧不接受 function 类型'],
    ['Divide by zero in constant', '常量表达式中发生除零'],
    ['Non-void functions must return a value.', '非 void 函数必须返回值'],
    ['Illegal lvalue', '非法左值'],
    ['Illegal lvalue, a possible lvalue is (x <assign> y)[a]', '非法左值，可尝试使用 (x <assign> y)[a] 这种形式'],
    ['Illegal to have (x[a..b] <assign> y) to be the beginning of an lvalue', '不能让 (x[a..b] <assign> y) 作为左值的起始部分'],
    ['Can\'t do range lvalue of range lvalue.', '不能对区间左值再次取区间左值'],
    ['Can\'t do indexed lvalue of range lvalue.', '不能对区间左值再次取索引左值'],
    ['Left argument of -> is not a class', '-> 左侧表达式不是 class'],
    ['Left argument of . is not a class', '. 左侧表达式不是 class'],
    [
        'A negative constant as the second element of arr[x..y] no longer means indexing from the end.  Use arr[x..<y]',
        'arr[x..y] 的第二个参数使用负常量时，不再表示从尾部索引；请改用 arr[x..<y]'
    ],
    ['Illegal index to array constant.', '数组常量索引非法'],
    ['Illegal index for mapping.', 'mapping 索引非法'],
    [
        'A negative constant in arr[x] no longer means indexing from the end.  Use arr[<x]',
        'arr[x] 中的负常量不再表示从尾部索引；请改用 arr[<x]'
    ],
    ['Reserved type name unexpected.', '这里不应出现保留类型名'],
    ['Anonymous varargs functions aren\'t implemented', '匿名 varargs 函数尚未实现'],
    ['Can\'t give parameters to functional.', 'functional 不允许显式传参'],
    ['Function pointer returning string constant is NOT a function call', '返回字符串常量的函数指针不是函数调用'],
    ['End of mapping not found', '未找到 mapping 的结束位置'],
    ['End of array not found', '未找到数组的结束位置'],
    ['Illegal to inherit after defining global variables.', '定义全局变量后不允许再 inherit'],
    ['Illegal to declare nosave function.', '函数不能声明为 nosave'],
    ['Illegal to redefine predefined value.', '不允许重定义预定义值'],
    ['Condition too complex in #elif', '#elif 条件表达式过于复杂'],
    ['/* found in comment.', '注释内部发现了嵌套的 /*'],
    ['Unknown #pragma, ignored.', '未知的 #pragma，已忽略'],
    ['<TAB>', '检测到 TAB 字符'],
    ['Illegal character constant.', '非法的字符常量'],
    ['Illegal character constant in string.', '字符串中包含非法的字符常量'],
    ['Unknown \\ escape.', '未知的反斜杠转义'],
    ['Missing \',\' in #define parameter list', '#define 参数列表中缺少逗号'],
    ['Missing \'(\' in macro call', '宏调用缺少左括号 ('],
    ['Wrong number of macro arguments', '宏参数数量不正确'],
    ['Missing ( in defined', 'defined 缺少左括号 ('],
    ['Missing ) in defined', 'defined 缺少右括号 )'],
    ['Modulo by zero constant', '常量表达式中对零取模'],
    ['Value of conditional expression is unused', '条件表达式的结果未被使用'],
    ['Expression has no side effects, and the value is unused', '表达式没有副作用，且其结果未被使用'],
    ['Unknown \\x char.', '未知的 \\x 转义字符'],
    ['Illegal use of ref', 'ref 的使用方式非法'],
    ['No access level for function!', '函数缺少访问级别修饰符'],
    ['Inconsistent aliasing of functions!', '函数别名解析不一致'],
    ['Aliasing difficulties!', '函数别名处理失败'],
    ['Program too large', '程序体积过大'],
    ['Too many local variables', '局部变量数量过多'],
    ['Too many global variables', '全局变量数量过多'],
    ['Called function is private.', '目标函数是 private，当前作用域无法调用'],
    ['Called function not compiled with type testing.', '目标函数未启用类型检查编译'],
    ['Number of arguments disagrees with previous definition.', '参数数量与之前的定义不一致'],
    ['BUG: inherit function is undefined or prototype, flags: %d', '继承函数仍是 undefined 或 prototype 状态（驱动内部诊断）'],
    ['free_prog_string: index out of range.', 'free_prog_string 下标越界（驱动内部诊断）'],
    ['free_prog_string: string not in prog table.', 'free_prog_string 找不到对应字符串（驱动内部诊断）']
]);

const TRANSLATION_RULES: TranslationRule[] = [
    {
        pattern: /^syntax error(?:, unexpected (?<unexpected>.+?))?(?:, expecting (?<expected>.+))?$/,
        translate: match => {
            const unexpected = match.groups?.unexpected?.trim();
            const expected = match.groups?.expected?.trim();
            if (unexpected && expected) {
                return `语法错误：遇到意外符号 ${unexpected}，期望 ${expected.replace(/\s+or\s+/g, ' 或 ')}`;
            }
            if (unexpected) {
                return `语法错误：遇到意外符号 ${unexpected}`;
            }
            return '语法错误';
        }
    },
    {
        pattern: /^Unused local variable '(?<name>.+)'$/,
        translate: match => `未使用的局部变量 '${match.groups?.name}'`
    },
    {
        pattern: /^(?:No such function '(?<nameA>.+)' defined\.|Function '(?<nameB>.+)' undefined\.|Undefined function (?<nameC>.+))$/,
        translate: match => `未定义函数 ${match.groups?.nameA ?? match.groups?.nameB ?? match.groups?.nameC ?? ''}`.trim()
    },
    {
        pattern: /^Undefined variable '(?<name>.+)'$/,
        translate: match => `未定义变量 '${match.groups?.name}'`
    },
    {
        pattern: /^Undefined class '(?<name>.+)'$/,
        translate: match => `未定义 class '${match.groups?.name}'`
    },
    {
        pattern: /^Unknown efun: (?<name>.+)$/,
        translate: match => `未知的 efun：${match.groups?.name}`
    },
    {
        pattern: /^More than one class in scope has member '(?<member>.+)'; use a cast to disambiguate\.$/,
        translate: match => `当前作用域有多个 class 含有成员 '${match.groups?.member}'，请使用强制转换消除歧义`
    },
    {
        pattern: /^No class in scope has no member '(?<member>.+)'\.$/,
        translate: match => `当前作用域内没有任何 class 包含成员 '${match.groups?.member}'`
    },
    {
        pattern: /^Class '(?<class>.+)' has no member '(?<member>.+)'$/,
        translate: match => `class '${match.groups?.class}' 不包含成员 '${match.groups?.member}'`
    },
    {
        pattern: /^Definitions of class '(?<name>.+)' differ in size\.$/,
        translate: match => `class '${match.groups?.name}' 的定义尺寸不一致`
    },
    {
        pattern: /^Definitions of class '(?<name>.+)' disagree\.$/,
        translate: match => `class '${match.groups?.name}' 的定义不一致`
    },
    {
        pattern: /^Redefinition of member '(?<member>.+)' in instantiation of class '(?<class>.+)'$/,
        translate: match => `实例化 class '${match.groups?.class}' 时重复定义了成员 '${match.groups?.member}'`
    },
    {
        pattern: /^Too many classes, max is (?<count>\d+)\.?$/,
        translate: match => `class 数量过多，最大允许 ${match.groups?.count} 个`
    },
    {
        pattern: /^Illegal to redefine 'nomask' function '(?<name>.+)'\.$/,
        translate: match => `禁止重定义 nomask 函数 '${match.groups?.name}'`
    },
    {
        pattern: /^Illegal to redefine 'nomask' variable '(?<name>.+)'\.$/,
        translate: match => `禁止重定义 nomask 变量 '${match.groups?.name}'`
    },
    {
        pattern: /^Redeclaration of function '(?<name>.+)'\.$/,
        translate: match => `函数重复声明：'${match.groups?.name}'`
    },
    {
        pattern: /^Redeclaration of global variable '(?<name>.+)'\.$/,
        translate: match => `全局变量重复声明：'${match.groups?.name}'`
    },
    {
        pattern: /^Illegal to redeclare local name '(?<name>.+)'$/,
        translate: match => `局部变量名重复声明：'${match.groups?.name}'`
    },
    {
        pattern: /^Illegal to call inherited private function '(?<name>.+)'$/,
        translate: match => `不能调用继承链中的 private 函数 '${match.groups?.name}'`
    },
    {
        pattern: /^Unable to find the inherited function '(?<name>.+)' in file '(?<file>.+)'\.$/,
        translate: match => `在文件 '${match.groups?.file}' 中找不到继承函数 '${match.groups?.name}'`
    },
    {
        pattern: /^Unable to find the inherited function '(?<name>.+)'\.$/,
        translate: match => `找不到继承函数 '${match.groups?.name}'`
    },
    {
        pattern: /^Too few arguments to '(?<name>.+)'\.$/,
        translate: match => `参数过少：'${match.groups?.name}'`
    },
    {
        pattern: /^Too many arguments to '(?<name>.+)'\.$/,
        translate: match => `参数过多：'${match.groups?.name}'`
    },
    {
        pattern: /^Wrong number of arguments to '(?<name>.+)', expected: (?<expected>\d+), minimum: (?<minimum>\d+), got: (?<got>\d+)\.$/,
        translate: match =>
            `参数数量错误：'${match.groups?.name}' 期望 ${match.groups?.expected} 个，最少 ${match.groups?.minimum} 个，实际传入 ${match.groups?.got} 个`
    },
    {
        pattern: /^Illegal to pass a variable number of arguments to non-varargs function '(?<name>.+)'\.$/,
        translate: match => `不能向非 varargs 函数 '${match.groups?.name}' 传入可变参数数量`
    },
    {
        pattern: /^Illegal to pass variable number of arguments to non-varargs efun '(?<name>.+)'\.$/,
        translate: match => `不能向非 varargs efun '${match.groups?.name}' 传入可变参数数量`
    },
    {
        pattern: /^Bad type for argument (?<index>\d+) of (?<name>[^\s]+) \(\s*(?<detail>.+?)\s*\)$/,
        translate: match =>
            `参数 ${match.groups?.index} 类型错误：${match.groups?.name}（${match.groups?.detail?.trim()}）`
    },
    {
        pattern: /^Bad argument (?<index>\d+) to efun (?<name>.+)\(\)$/,
        translate: match => `efun ${match.groups?.name}() 的参数 ${match.groups?.index} 类型不合法`
    },
    {
        pattern: /^Bad argument(?: number)? (?<index>\d+) to (?<target>.+): "(?<type>.+)"$/,
        translate: match => `参数 ${match.groups?.index} 类型错误：${match.groups?.target} 不接受类型 "${match.groups?.type}"`
    },
    {
        pattern: /^Bad argument to (?<target>.+): "(?<type>.+)"$/,
        translate: match => `参数类型错误：${match.groups?.target} 不接受类型 "${match.groups?.type}"`
    },
    {
        pattern: /^Type mismatch (?<detail>.+)$/,
        translate: match => `类型不匹配 ${match.groups?.detail}`
    },
    {
        pattern: /^Bad assignment (?<detail>.+)$/,
        translate: match => `赋值类型错误 ${match.groups?.detail}`
    },
    {
        pattern: /^Types in \?: do not match (?<detail>.+)$/,
        translate: match => `三元表达式两侧类型不匹配 ${match.groups?.detail}`
    },
    {
        pattern: /^Incompatible types for (?<operator>[|&]) (?<detail>.+)$/,
        translate: match => `运算符 ${match.groups?.operator} 两侧类型不兼容 ${match.groups?.detail}`
    },
    {
        pattern: /^(?<operator>==|!=) always (?<result>false|true) because of incompatible types (?<detail>.+)$/,
        translate: match =>
            `由于类型不兼容，表达式 ${match.groups?.operator} 的结果恒为 ${match.groups?.result === 'true' ? '真' : '假'} ${match.groups?.detail}`
    },
    {
        pattern: /^Type of returned value doesn't match function return type (?<detail>.+)$/,
        translate: match => `返回值类型与函数声明不匹配 ${match.groups?.detail}`
    },
    {
        pattern: /^Invalid (?:float|integer|binary integer|hex integer) literal: (?<value>.+)$/,
        translate: match => `非法字面量：${match.groups?.value}`
    },
    {
        pattern: /^redefinition of #define (?<name>.+)$/,
        translate: match => `重复定义了 #define ${match.groups?.name}`
    },
    {
        pattern: /^Functions with default arguments can only have (?<count>\d+) args$/,
        translate: match => `带默认参数的函数最多只能有 ${match.groups?.count} 个参数`
    },
    {
        pattern: /^Illegal to redefine class '(?<name>.+)',?$/,
        translate: match => `禁止重定义 class '${match.groups?.name}'`
    },
    {
        pattern: /^Illegal to declare (?:argument|global variable|local variable|class member) of type void\.$/,
        translate: match => {
            const subject = match[0].includes('argument')
                ? '参数'
                : match[0].includes('global variable')
                    ? '全局变量'
                    : match[0].includes('local variable')
                        ? '局部变量'
                        : '类成员';
            return `${subject}不能声明为 void 类型`;
        }
    },
    {
        pattern: /^Multiple access modifiers \((?<mods>.+)\)$/,
        translate: match => `访问修饰符重复或冲突（${match.groups?.mods}）`
    },
    {
        pattern: /^branch limit exceeded in (?<where>.+), near line (?<line>\d+)$/,
        translate: match => `分支数量超限：${match.groups?.where}，附近行号 ${match.groups?.line}`
    },
    {
        pattern: /^branch limit exceeded in switch table, near line (?<line>\d+)$/,
        translate: match => `switch 表分支数量超限，附近行号 ${match.groups?.line}`
    }
];

export function normalizeCompilerDiagnosticMessageLanguage(
    value: string | null | undefined
): CompilerDiagnosticMessageLanguage {
    if (value === 'dual' || value === 'en' || value === 'zh') {
        return value;
    }
    return 'dual';
}

export function describeCompilerDiagnosticMessageLanguage(
    mode: CompilerDiagnosticMessageLanguage
): string {
    switch (mode) {
        case 'zh':
            return '仅中文';
        case 'en':
            return '仅英文';
        default:
            return '中英双语';
    }
}

function normalizeMessage(message: string): string {
    return message.trim().replace(/\r?\n+$/g, '').trim();
}

function translateToChinese(rawMessage: string): string {
    const normalizedMessage = normalizeMessage(rawMessage);
    if (!normalizedMessage) {
        return normalizedMessage;
    }

    const exact = EXACT_TRANSLATIONS.get(normalizedMessage);
    if (exact) {
        return exact;
    }

    for (const rule of TRANSLATION_RULES) {
        const match = normalizedMessage.match(rule.pattern);
        if (match) {
            return rule.translate(match);
        }
    }

    return normalizedMessage;
}

export function formatCompilerDiagnosticMessage(
    rawMessage: string,
    _severity: CompilerDiagnosticSeverity,
    languageMode: CompilerDiagnosticMessageLanguage = 'en'
): string {
    const normalizedMessage = normalizeMessage(rawMessage);
    const zhMessage = translateToChinese(normalizedMessage);

    if (languageMode === 'en') {
        return normalizedMessage;
    }
    if (languageMode === 'zh') {
        return zhMessage;
    }
    if (zhMessage === normalizedMessage) {
        return normalizedMessage;
    }
    return `${zhMessage}（${normalizedMessage}）`;
}

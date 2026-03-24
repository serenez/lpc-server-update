# 编译诊断中文化对照表

## 目标

本方案只在 **`lpc-server-update` 插件侧** 做编译诊断中文化，**FluffOS 驱动原始英文输出保持不变**。

这样做有两个目的：

1. 不破坏插件现有的英文诊断解析、列号定位和整词高亮。
2. 本地 LPCC 与远程编译可以共用同一套中文化逻辑，而不依赖服务器配置。

---

## 语言设置

VS Code 设置项：

```json
"gameServerCompiler.diagnostics.messageLanguage": "dual"
```

支持三种模式：

| 值 | 含义 | 展示效果 |
|---|---|---|
| `dual` | 中英双语 | 先中文，后附原始英文 |
| `en` | 仅英文 | 完全保留驱动原文 |
| `zh` | 仅中文 | 只显示中文翻译 |

默认值：`dual`

---

## 驱动扫描范围

当前词表按下面这些驱动文件整理：

- `fluffos/src/compiler/internal/compiler.cc`
- `fluffos/src/compiler/internal/grammar.y`
- `fluffos/src/compiler/internal/grammar_rules.cc`
- `fluffos/src/compiler/internal/lex.cc`
- `fluffos/src/compiler/internal/trees.cc`
- `fluffos/src/compiler/internal/scratchpad.cc`
- `fluffos/src/compiler/internal/icode.cc`

说明：

- **固定英文原文**：表里直接列出原文。
- **动态拼装的消息**：表里按模板归并，例如 `Bad type for argument N of foo (...)`。
- **Bison 语法错误**：按 `syntax error ...` 模板归并，不逐条枚举 token 组合。

插件实现以 [src/utils/compilerDiagnosticLocalization.ts](/C:/Users/vrustx/Desktop/mud_nextB/lpc-server-update/src/utils/compilerDiagnosticLocalization.ts) 为准。

---

## 对照表

| 分类 | 驱动英文原文 / 模板 | 插件中文显示 | 主要来源 |
|---|---|---|---|
| 语法错误 | `syntax error` | `语法错误` | `grammar.autogen.cc` |
| 语法错误 | `syntax error, unexpected X` | `语法错误：遇到意外符号 X` | `grammar.autogen.cc` |
| 语法错误 | `syntax error, unexpected X, expecting A or B ...` | `语法错误：遇到意外符号 X，期望 A 或 B ...` | `grammar.autogen.cc` |
| 警告 | `Unused local variable 'name'` | `未使用的局部变量 'name'` | `compiler.cc` |
| 未定义 | `Undefined function name` | `未定义函数 name` | `grammar.y` |
| 未定义 | `Function 'name' undefined.` | `未定义函数 name` | `compiler.cc` |
| 未定义 | `No such function 'name' defined.` | `未定义函数 name` | `compiler.cc` |
| 未定义 | `Undefined variable 'name'` | `未定义变量 'name'` | `grammar.y` |
| 未定义 | `Undefined class 'name'` | `未定义 class 'name'` | `grammar.y` |
| 未定义 | `Unknown efun: name` | `未知的 efun：name` | `grammar.y` |
| class | `Class 'A' has no member 'b'` | `class 'A' 不包含成员 'b'` | `compiler.cc` |
| class | `No class in scope has no member 'b'.` | `当前作用域内没有任何 class 包含成员 'b'` | `compiler.cc` |
| class | `More than one class in scope has member 'b'...` | `当前作用域有多个 class 含有成员 'b'，请使用强制转换消除歧义` | `compiler.cc` |
| class | `Definitions of class 'A' differ in size.` | `class 'A' 的定义尺寸不一致` | `compiler.cc` |
| class | `Definitions of class 'A' disagree.` | `class 'A' 的定义不一致` | `compiler.cc` |
| class | `Redefinition of member 'm' in instantiation of class 'A'` | `实例化 class 'A' 时重复定义了成员 'm'` | `compiler.cc` |
| 声明/重定义 | `Redeclaration of function 'name'.` | `函数重复声明：'name'` | `compiler.cc` |
| 声明/重定义 | `Redeclaration of global variable 'name'.` | `全局变量重复声明：'name'` | `compiler.cc` |
| 声明/重定义 | `Illegal to redeclare local name 'name'` | `局部变量名重复声明：'name'` | `grammar.y` |
| 声明/重定义 | `Illegal to redefine 'nomask' function 'name'.` | `禁止重定义 nomask 函数 'name'` | `compiler.cc` |
| 声明/重定义 | `Illegal to redefine 'nomask' variable 'name'.` | `禁止重定义 nomask 变量 'name'` | `compiler.cc` |
| 继承/访问 | `Called function is private.` | `目标函数是 private，当前作用域无法调用` | `compiler.cc` |
| 继承/访问 | `Illegal to call inherited private function 'name'` | `不能调用继承链中的 private 函数 'name'` | `compiler.cc` |
| 继承/访问 | `Unable to find the inherited function 'name'.` | `找不到继承函数 'name'` | `compiler.cc` |
| 继承/访问 | `Unable to find the inherited function 'name' in file 'file'.` | `在文件 'file' 中找不到继承函数 'name'` | `compiler.cc` |
| 参数数量 | `Too few arguments to 'name'.` | `参数过少：'name'` | `compiler.cc` |
| 参数数量 | `Too many arguments to 'name'.` | `参数过多：'name'` | `compiler.cc` |
| 参数数量 | `Wrong number of arguments to 'name', expected: E, minimum: M, got: G.` | `参数数量错误：'name' 期望 E 个，最少 M 个，实际传入 G 个` | `compiler.cc` |
| 参数数量 | `Illegal to pass a variable number of arguments to non-varargs function 'name'.` | `不能向非 varargs 函数 'name' 传入可变参数数量` | `compiler.cc` |
| 参数数量 | `Illegal to pass variable number of arguments to non-varargs efun 'name'.` | `不能向非 varargs efun 'name' 传入可变参数数量` | `compiler.cc` |
| 参数类型 | `Bad type for argument N of foo ( ... )` | `参数 N 类型错误：foo（...）` | `compiler.cc` |
| 参数类型 | `Bad argument N to efun foo()` | `efun foo() 的参数 N 类型不合法` | `compiler.cc` |
| 参数类型 | `Bad argument number N to op: "type"` | `参数 N 类型错误：op 不接受类型 "type"` | `grammar.y` |
| 参数类型 | `Bad argument to op: "type"` | `参数类型错误：op 不接受类型 "type"` | `grammar.y` |
| 类型系统 | `Type mismatch ...` | `类型不匹配 ...` | `grammar.y` |
| 类型系统 | `Bad assignment ...` | `赋值类型错误 ...` | `grammar.y` |
| 类型系统 | `Types in ?: do not match ...` | `三元表达式两侧类型不匹配 ...` | `grammar.y` |
| 类型系统 | `Incompatible types for | ...` | `运算符 | 两侧类型不兼容 ...` | `grammar.y` |
| 类型系统 | `Incompatible types for & ...` | `运算符 & 两侧类型不兼容 ...` | `grammar.y` |
| 类型系统 | `== always false because of incompatible types ...` | `由于类型不兼容，表达式 == 的结果恒为假 ...` | `grammar.y` |
| 类型系统 | `!= always true because of incompatible types ...` | `由于类型不兼容，表达式 != 的结果恒为真 ...` | `grammar.y` |
| 返回值 | `Non-void functions must return a value.` | `非 void 函数必须返回值` | `grammar.y` |
| 返回值 | `Type of returned value doesn't match function return type ...` | `返回值类型与函数声明不匹配 ...` | `grammar.y` |
| 左值/索引 | `Illegal lvalue` | `非法左值` | `grammar.y` |
| 左值/索引 | `Illegal lvalue, a possible lvalue is (x <assign> y)[a]` | `非法左值，可尝试使用 (x <assign> y)[a] 这种形式` | `grammar.y` |
| 左值/索引 | `Illegal to have (x[a..b] <assign> y) to be the beginning of an lvalue` | `不能让 (x[a..b] <assign> y) 作为左值的起始部分` | `grammar.y` |
| 左值/索引 | `Can't do range lvalue of range lvalue.` | `不能对区间左值再次取区间左值` | `grammar.y` |
| 左值/索引 | `Can't do indexed lvalue of range lvalue.` | `不能对区间左值再次取索引左值` | `grammar.y` |
| 左值/索引 | `Illegal LHS` | `赋值左侧表达式非法` | `grammar.y` |
| 左值/索引 | `Illegal index to array constant.` | `数组常量索引非法` | `grammar.y` |
| 左值/索引 | `Illegal index for mapping.` | `mapping 索引非法` | `grammar.y` |
| 左值/索引 | `Left argument of -> is not a class` | `-> 左侧表达式不是 class` | `grammar.y` |
| 左值/索引 | `Left argument of . is not a class` | `. 左侧表达式不是 class` | `grammar.y` |
| 流程控制 | `Cannot break out of catch { } or time_expression { }` | `不能从 catch { } 或 time_expression { } 中 break` | `grammar.y` |
| 流程控制 | `break statement outside loop` | `break 语句只能出现在循环内部` | `grammar.y` |
| 流程控制 | `Cannot continue out of catch { } or time_expression { }` | `不能从 catch { } 或 time_expression { } 中 continue` | `grammar.y` |
| 流程控制 | `continue statement outside loop` | `continue 语句只能出现在循环内部` | `grammar.y` |
| switch/foreach | `Mapping key may not be a reference in foreach()` | `foreach() 中的 mapping key 不能是引用` | `grammar.y` |
| switch/foreach | `need case statements in switch/case, not just default:` | `switch/case 不能只有 default，至少需要一个 case` | `grammar.y` |
| switch/foreach | `String case labels not allowed as range bounds` | `字符串 case 标签不能作为范围边界` | `grammar.y` |
| switch/foreach | `Duplicate default` | `重复定义了 default 分支` | `grammar.y` |
| switch/foreach | `Mixed case label list not allowed` | `不允许混用不同类型的 case 标签列表` | `grammar.y` |
| 常量/算术 | `Modulo by zero` | `对零取模` | `grammar.y` |
| 常量/算术 | `Division by zero` | `除数不能为零` | `grammar.y` |
| 常量/算术 | `Divide by zero in constant` | `常量表达式中发生除零` | `grammar.y` |
| 常量/算术 | `Modulo by zero constant` | `常量表达式中对零取模` | `trees.cc` |
| 常量/算术 | `Bad arguments to '+' (unknown vs unknown)` | `加号两侧参数类型都无法确定` | `grammar.y` |
| 常量/算术 | `Bad right argument to '+' (function)` | `加号右侧不接受 function 类型` | `grammar.y` |
| 常量/算术 | `Bad left argument to '+' (function)` | `加号左侧不接受 function 类型` | `grammar.y` |
| 声明限制 | `Missing type for argument` | `参数声明缺少类型` | `grammar.y` |
| 声明限制 | `Missing type for global variable declaration` | `全局变量声明缺少类型` | `grammar.y` |
| 声明限制 | `Illegal to declare argument of type void.` | `参数不能声明为 void 类型` | `grammar.y` |
| 声明限制 | `Illegal to declare global variable of type void.` | `全局变量不能声明为 void 类型` | `grammar.y` |
| 声明限制 | `Illegal to declare local variable of type void.` | `局部变量不能声明为 void 类型` | `grammar.y` |
| 声明限制 | `Illegal to declare class member of type void.` | `类成员不能声明为 void 类型` | `grammar.y` |
| 声明限制 | `Variable to hold remainder of args may not be a reference` | `接收剩余参数的变量不能是引用` | `grammar.y` |
| 声明限制 | `Variable to hold remainder of arguments should be an array.` | `接收剩余参数的变量应该是数组` | `grammar.y` |
| 声明限制 | `Illegal to declare varargs variable.` | `变量不能声明为 varargs` | `grammar.y` |
| 声明限制 | `Only '=' is legal in initializers.` / `Only '=' is allowed in initializers.` | `初始化表达式中只允许使用 =` | `grammar.y` |
| 预处理/词法 | `'##' at start of macro definition` | `宏定义开头不能使用 ##` | `lex.cc` |
| 预处理/词法 | `'##' at end of macro definition` | `宏定义结尾不能使用 ##` | `lex.cc` |
| 预处理/词法 | `redefinition of #define name` | `重复定义了 #define name` | `lex.cc` |
| 预处理/词法 | `Condition too complex in #elif` | `#elif 条件表达式过于复杂` | `lex.cc` |
| 预处理/词法 | `Unknown #pragma, ignored.` | `未知的 #pragma，已忽略` | `lex.cc` |
| 预处理/词法 | `Invalid float literal: x` | `非法字面量：x` | `lex.cc` |
| 预处理/词法 | `Invalid integer literal: x` | `非法字面量：x` | `lex.cc` |
| 预处理/词法 | `Invalid binary integer literal: x` | `非法字面量：x` | `lex.cc` |
| 预处理/词法 | `Invalid hex integer literal: x` | `非法字面量：x` | `lex.cc` |
| 预处理/词法 | `Missing ',' in #define parameter list` | `#define 参数列表中缺少逗号` | `lex.cc` |
| 预处理/词法 | `Missing '(' in macro call` | `宏调用缺少左括号 (` | `lex.cc` |
| 预处理/词法 | `Wrong number of macro arguments` | `宏参数数量不正确` | `lex.cc` |
| 预处理/词法 | `Missing ( in defined` | `defined 缺少左括号 (` | `lex.cc` |
| 预处理/词法 | `Missing ) in defined` | `defined 缺少右括号 )` | `lex.cc` |
| 转义/字符 | `Unknown \x char.` | `未知的 \x 转义字符` | `scratchpad.cc` |
| 转义/字符 | `Unknown \ escape.` | `未知的反斜杠转义` | `lex.cc` |
| 转义/字符 | `Illegal character constant.` | `非法的字符常量` | `lex.cc` |
| 转义/字符 | `Illegal character constant in string.` | `字符串中包含非法的字符常量` | `lex.cc` |
| 警告 | `Value of conditional expression is unused` | `条件表达式的结果未被使用` | `trees.cc` |
| 警告 | `Expression has no side effects, and the value is unused` | `表达式没有副作用，且其结果未被使用` | `trees.cc` |
| 警告 | `bitwise operation on boolean values.` | `对布尔值执行了位运算` | `grammar.y` |
| 容量/内部诊断 | `Too many local variables` | `局部变量数量过多` | `compiler.cc` |
| 容量/内部诊断 | `Too many global variables` | `全局变量数量过多` | `compiler.cc` |
| 容量/内部诊断 | `Too many classes, max is N` | `class 数量过多，最大允许 N 个` | `compiler.cc` |
| 容量/内部诊断 | `Program too large` | `程序体积过大` | `compiler.cc` |
| 容量/内部诊断 | `branch limit exceeded in X, near line N` | `分支数量超限：X，附近行号 N` | `icode.cc` |
| 容量/内部诊断 | `branch limit exceeded in switch table, near line N` | `switch 表分支数量超限，附近行号 N` | `icode.cc` |

---

## 当前实现边界

1. 插件内部始终保留原始英文消息用于：
   - 诊断头解析
   - 关键字分类
   - 列号 / 整词范围推断

2. 用户可见的文本才会按设置转换成：
   - 英文
   - 中文
   - 双语

3. 对于驱动未来新增、但当前表中还没有的消息：
   - `dual` 会直接回退到原始英文
   - `zh` 也会暂时回退到原始英文

这保证了**不会因为翻译表遗漏而丢失诊断信息**。

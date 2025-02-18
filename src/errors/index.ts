export class BaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class NetworkError extends BaseError {
    constructor(message: string) {
        super(`网络错误: ${message}`);
    }
}

export class ConfigError extends BaseError {
    constructor(message: string) {
        super(`配置错误: ${message}`);
    }
}

export class CompileError extends BaseError {
    constructor(message: string) {
        super(`编译错误: ${message}`);
    }
}

export class AuthenticationError extends BaseError {
    constructor(message: string) {
        super(`认证错误: ${message}`);
    }
}

export class TimeoutError extends BaseError {
    constructor(message: string) {
        super(`超时错误: ${message}`);
    }
}

export class ValidationError extends BaseError {
    constructor(message: string) {
        super(`验证错误: ${message}`);
    }
}

export class CommandError extends BaseError {
    constructor(message: string) {
        super(`命令错误: ${message}`);
    }
}

export class StateError extends BaseError {
    constructor(message: string) {
        super(`状态错误: ${message}`);
    }
} 

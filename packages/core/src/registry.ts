/**
 * 元数据注册表：Model 的注册 / 查询 / 校验。
 * 支持按 id（全局唯一）与 name+namespace 查询。
 */

import type { IModel } from "./types/model.js";
import { validateModel } from "./validator.js";
import { SYSTEM_MODELS } from "./system-models.js";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export class Registry {
  private readonly byId = new Map<string, IModel>();
  private readonly byQualifiedName = new Map<string, IModel>();

  constructor() {
    // 装载系统模型（自举起点）
    for (const m of SYSTEM_MODELS) {
      this.register(m);
    }
  }

  /** 注册 Model（含校验，重复 id 报错） */
  register(model: IModel): void {
    const result = validateModel(model);
    if (!result.valid) {
      const first = result.issues[0];
      throw new RegistryError(`Model 校验失败: ${first?.path} ${first?.message}`);
    }
    const key = this.qualifiedName(model.namespace, model.name);
    if (this.byId.has(model.id)) {
      throw new RegistryError(`Model id '${model.id}' 已注册`);
    }
    if (this.byQualifiedName.has(key)) {
      throw new RegistryError(`Model '${key}' 已注册`);
    }
    this.byId.set(model.id, model);
    this.byQualifiedName.set(key, model);
  }

  /** 按全局唯一 id 查询 */
  getById(id: string): IModel | undefined {
    return this.byId.get(id);
  }

  /** 按 namespace + name 查询 */
  get(namespace: string, name: string): IModel | undefined {
    return this.byQualifiedName.get(this.qualifiedName(namespace, name));
  }

  /** 是否已注册 */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** 全部已注册模型 */
  all(): IModel[] {
    return [...this.byId.values()];
  }

  private qualifiedName(namespace: string, name: string): string {
    return `${namespace}:${name}`;
  }
}

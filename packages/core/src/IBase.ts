/**
 * 基础元数据（所有系统模型共享）。
 * id 为点分路径：`父级id + "." + 自身name`（顶层对象父级为命名空间）。
 * - namespace：父级 id（顶层对象为真正的命名空间，如 "sys" 或业务模块名，不为空）。
 * - name：自身名称。
 * - id：`namespace + "." + name`。
 * 例：model "sys.user"；其 field "username" → namespace="sys.user"、name="username"、id="sys.user.username"。
 */
export interface IBase {
  id: string;
  namespace: string;
  name: string;
  displayName?: string;
}

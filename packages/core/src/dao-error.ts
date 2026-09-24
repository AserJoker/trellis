/** DAO / 级联写入的领域错误 */
export class DaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaoError";
  }
}

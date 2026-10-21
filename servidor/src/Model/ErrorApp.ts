/**
 * Error de negocio con código HTTP.
 * Equivale a una excepción propia en Java (class ErrorApp extends Exception).
 * Los Services la lanzan y los Controllers la convierten en la respuesta HTTP.
 */
export default class ErrorApp extends Error {
  public status: number;

  /**
   * @param mensaje texto que verá el client
   * @param status código HTTP (400 datos inválidos, 404 no encontrado, 409 duplicado)
   */
  constructor(mensaje: string, status: number = 400) {
    super(mensaje);
    this.status = status;
  }
}
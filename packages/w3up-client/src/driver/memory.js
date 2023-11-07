/**
 * @template T
 * @typedef {import('./types.js').Driver<T>} Driver
 */

/**
 * Driver implementation that stores data in memory."
 *
 * Usage:
 *
 * ```js
 * import { MemoryDriver } from '@web3-storage/access/drivers/memory'
 * ```
 *
 * @template {Record<string, any>} T
 * @implements {Driver<T>}
 */
export class MemoryDriver {
  /**
   * @type {T|undefined}
   */
  #data

  constructor() {
    this.#data = undefined
  }

  /* c8 ignore next */
  async open() {}

  /* c8 ignore next */
  async close() {}

  /* c8 ignore next 3 */
  async reset() {
    this.#data = undefined
  }

  /** @param {T} data */
  async save(data) {
    this.#data = { ...data }
  }

  /** @returns {Promise<T|undefined>} */
  async load() {
    /* c8 ignore next 3 */
    if (this.#data === undefined) return
    if (Object.keys(this.#data).length === 0) return
    return this.#data
  }
}

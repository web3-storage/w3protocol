import retry, { AbortError } from 'p-retry'
import { CAR } from '@ucanto/transport'
import { receiptsEndpoint } from './service.js'
import { REQUEST_RETRIES } from './constants.js'

export class Receipt {
  /**
   * @param {import('./types.js').RequestOptions} [options]
   */
  constructor(options = {}) {
    /* c8 ignore start */
    this.receiptsEndpoint = options.receiptsEndpoint ?? receiptsEndpoint
    this.retries = options.retries ?? REQUEST_RETRIES
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    /* c8 ignore stop */
  }

  /**
   * Polls for a receipt for an executed task by its CID.
   *
   * @param {import('multiformats').UnknownLink} taskCid
   * @returns {Promise<import('@ucanto/interface').Receipt>}
   */
  async poll(taskCid) {
    return await retry(
      async () => {
        const res = await this.get(taskCid)
        if (res.error) {
          // @ts-ignore
          if (res.error.name === 'ReceiptNotFound') {
            // throw an error that will cause `p-retry` to retry with
            throw new Error('blob/accept receipt not yet available')
          } else {
            throw new AbortError(
              new Error('failed to fetch blob/accept receipt', {
                cause: res.error,
              })
            )
          }
        }
        return res.ok
      },
      {
        onFailedAttempt: console.warn,
        retries: this.retries ?? REQUEST_RETRIES,
      }
    )
  }

  /**
   * Get a receipt for an executed task by its CID.
   *
   * @param {import('multiformats').UnknownLink} taskCid
   * @returns {Promise<import('@ucanto/client').Result<import('@ucanto/interface').Receipt, Error>>}
   */
  async get(taskCid) {
    // Fetch receipt from endpoint
    const url = new URL(taskCid.toString(), this.receiptsEndpoint)
    const workflowResponse = await this.fetch(url)
    /* c8 ignore start */
    if (!workflowResponse.ok) {
      return {
        error: new Error(
          `no receipt available for requested task ${taskCid.toString()}`
        ),
      }
    }
    /* c8 ignore stop */
    // Get receipt from Message Archive
    const agentMessageBytes = new Uint8Array(
      await workflowResponse.arrayBuffer()
    )
    // Decode message
    const agentMessage = await CAR.request.decode({
      body: agentMessageBytes,
      headers: {},
    })
    // Get receipt from the potential multiple receipts in the message
    const receipt = agentMessage.receipts.get(taskCid.toString())
    if (!receipt) {
      const error = new Error()
      error.name = 'ReceiptNotFound'
      return {
        error,
      }
    }
    return {
      ok: receipt,
    }
  }
}

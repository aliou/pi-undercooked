/**
 * Sentinel key for serializing all DAP-backed tool calls.
 *
 * Tools using the simulator DAP connection (sim_input, sim_eval, screenshot)
 * wrap their execute body in `withFileMutationQueue(DAP_QUEUE_KEY, ...)`.
 * This prevents parallel tool calls from interleaving DAP requests, which
 * would cause out-of-order button presses, eval results on stale state, or
 * screenshots taken mid-input.
 */
export const DAP_QUEUE_KEY = "__playdate_dap__";

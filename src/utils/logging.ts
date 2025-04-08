// Utility function for consistent logging format
export function logDebug(context: string, message: string, data?: any): void {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		context,
		message,
		...(data && { data }),
	};
	console.log(JSON.stringify(logEntry));
}

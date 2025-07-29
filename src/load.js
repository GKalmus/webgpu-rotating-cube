export async function loadFile(url) {
	const response = await fetch(url);
	return await response.text();
}


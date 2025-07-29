import { cubeVertexArray, cubeVertexSize, cubeUVOffset, cubePositionOffset, cubeVertexCount } from '/src/cube.js';
import { vec3, mat4 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.min.js';
import { loadFile } from "/src/load.js";

if (!navigator.gpu) {
	console.error("WebGPU is not supported in this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const cubeShaderFile = await loadFile("./shaders/cube.wgsl");
const cubeShaderModule = device.createShaderModule({
	code: cubeShaderFile,
});

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const depthFormat = 'depth24plus';

context.configure({
	device,
	format: presentationFormat,
	alphaMode: 'premultiplied',
});

const verticesBuffer = device.createBuffer({
	size: cubeVertexArray.byteLength,
	usage: GPUBufferUsage.VERTEX,
	mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

const renderPipeline = device.createRenderPipeline({
	label: 'Render Pipeline',
	layout: 'auto',
	vertex: {
		entryPoint: 'vs',
		module: cubeShaderModule,
		buffers: [{
			arrayStride: cubeVertexSize,
			attributes: [
				{ shaderLocation: 0, offset: cubePositionOffset, format: 'float32x4' }, // position
				{ shaderLocation: 1, offset: cubeUVOffset, format: 'float32x2' }, // UV
			],
		}],
	},
	fragment: {
		entryPoint: 'fs',
		module: cubeShaderModule,
		targets: [{ format: presentationFormat }],
	},
	primitive: { topology: 'triangle-list', cullMode: 'back' },
	depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
});

let depthTexture = device.createTexture({
	size: [canvas.width, canvas.height],
	format: depthFormat,
	usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const uniformBufferSize = 4 * 16;
const uniformBuffer = device.createBuffer({
	size: uniformBufferSize,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uniformBindGroup = device.createBindGroup({
	layout: renderPipeline.getBindGroupLayout(0),
	entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
})

const clearColor = [0.3, 0.3, 0.3, 1];
const renderPassDescriptor = {
	colorAttachments: [{
		view: undefined,
		clearValue: clearColor,
		loadOp: 'clear',
		storeOp: 'store',
	}],
	depthStencilAttachment: {
		view: depthTexture.createView(),
		depthClearValue: 1.0,
		depthLoadOp: 'clear',
		depthStoreOp: 'store',
	},
};

let aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
	const viewMatrix = mat4.identity();
	mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
	const now = Date.now() / 1000;
	mat4.rotate(viewMatrix, vec3.fromValues(Math.sin(now), Math.cos(now), 0), 1, viewMatrix);
	mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

	return modelViewProjectionMatrix;
}

function frame() {
	const currentWidth = canvas.clientWidth * devicePixelRatio;
	const currentHeight = canvas.clientHeight * devicePixelRatio;

	if ((currentWidth !== canvas.width || currentHeight !== canvas.height || !depthTexture) && currentWidth && currentHeight) {
		if (depthTexture) { depthTexture.destroy() }
		canvas.width = currentWidth;
		canvas.height = currentHeight;
		aspect = canvas.width / canvas.height;
		depthTexture = device.createTexture({
			size: [canvas.width, canvas.height],
			format: depthFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}
	renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
	const transformationMatrix = getTransformationMatrix();
	device.queue.writeBuffer(
		uniformBuffer,
		0,
		transformationMatrix.buffer,
		transformationMatrix.byteOffset,
		transformationMatrix.byteLength
	);
	renderPassDescriptor.colorAttachments[0].view = context
		.getCurrentTexture()
		.createView();

	const commandEncoder = device.createCommandEncoder({ label: 'frame' });
	const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
	passEncoder.setPipeline(renderPipeline);
	passEncoder.setBindGroup(0, uniformBindGroup);
	passEncoder.setVertexBuffer(0, verticesBuffer);
	passEncoder.draw(cubeVertexCount);
	passEncoder.end();
	device.queue.submit([commandEncoder.finish()]);
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame)

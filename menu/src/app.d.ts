// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare module "*.gif?inline" {
	const src: string;
	export default src;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import { page } from '$app/state';
</script>

{#key page.params.id}<Player id={page.params.id} viewer={false} />{/key}

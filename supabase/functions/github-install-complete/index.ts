Deno.serve(() => new Response(JSON.stringify({ error: 'Fluxo substituído pelo OAuth verificado do GitHub.' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));

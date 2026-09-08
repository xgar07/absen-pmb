import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const { action, ...payload } = await req.json()

    if (action === 'pair') {
      const { pairing_code, public_key } = payload
      
      if (!pairing_code || !public_key || typeof public_key !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Atomic pairing update
      const { data: stations, error: updateError } = await supabaseAdmin
        .from('attendance_stations')
        .update({
          public_key: public_key,
          pairing_code: null,
          pairing_expires_at: null
        })
        .eq('pairing_code', pairing_code)
        .is('public_key', null)
        .gte('pairing_expires_at', new Date().toISOString())
        .select('id, name')

      if (updateError || !stations || stations.length === 0) {
        return new Response(JSON.stringify({ error: 'Pairing code tidak valid, expired, atau sudah digunakan' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, station_id: stations[0].id, name: stations[0].name }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else if (action === 'challenge') {
      const { station_id } = payload
      
      if (!station_id) {
         return new Response(JSON.stringify({ error: 'Missing station_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Verify station active
      const { data: station, error: stationError } = await supabaseAdmin
        .from('attendance_stations')
        .select('is_active, public_key')
        .eq('id', station_id)
        .single()

      if (stationError || !station || !station.is_active || !station.public_key) {
        return new Response(JSON.stringify({ error: 'Station tidak aktif atau tidak ditemukan' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Generate secure challenge
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const challengeText = btoa(String.fromCharCode(...randomBytes));
      
      // Store challenge server-side
      const expiresAt = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minute
      const { data: challengeRow, error: insertError } = await supabaseAdmin
        .from('kiosk_challenges')
        .insert({
          station_id: station_id,
          challenge: challengeText,
          expires_at: expiresAt
        })
        .select('id')
        .single()

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ success: true, challenge_id: challengeRow.id, challenge: challengeText }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else if (action === 'get_tokens') {
      const { station_id, challenge_id, signature } = payload
      
      if (!station_id || !challenge_id || !signature) {
        return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // 1. Consume Challenge Atomically
      const { data: challengeData, error: challengeError } = await supabaseAdmin
        .from('kiosk_challenges')
        .update({ is_used: true })
        .eq('id', challenge_id)
        .eq('station_id', station_id)
        .eq('is_used', false)
        .gte('expires_at', new Date().toISOString())
        .select('challenge')
      
      if (challengeError || !challengeData || challengeData.length === 0) {
        return new Response(JSON.stringify({ error: 'Challenge invalid, expired, or reused' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const originalChallenge = challengeData[0].challenge;

      // 2. Fetch Station Public Key & Status
      const { data: station, error: stationError } = await supabaseAdmin
        .from('attendance_stations')
        .select('public_key, is_active')
        .eq('id', station_id)
        .single()
      
      if (stationError || !station || !station.is_active || !station.public_key) {
        return new Response(JSON.stringify({ error: 'Station inactive or not found' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // 3. Verify Signature using Web Crypto
      try {
        const pubKeyBuffer = base64ToUint8Array(station.public_key);
        const importedKey = await crypto.subtle.importKey(
          'spki',
          pubKeyBuffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        );

        const sigBuffer = base64ToUint8Array(signature);
        const dataBuffer = new TextEncoder().encode(originalChallenge);

        const isValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          importedKey,
          sigBuffer,
          dataBuffer
        );

        if (!isValid) {
          return new Response(JSON.stringify({ error: 'Signature verification failed' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      } catch (cryptoErr) {
        console.error('Crypto error:', cryptoErr);
        return new Response(JSON.stringify({ error: 'Crypto verification error' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // 4. Success: Generate Existing QR Tokens
      // Since get_kiosk_tokens is accessible to anon/authenticated, we can invoke it via RPC
      const { data: tokens, error: rpcError } = await supabaseAdmin.rpc('get_kiosk_tokens', { batch_size: 5 })
      
      if (rpcError) {
        return new Response(JSON.stringify({ error: 'Failed to generate tokens' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, tokens: tokens }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else {
       return new Response(JSON.stringify({ error: 'Invalid action' }), {
         status: 400,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       })
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

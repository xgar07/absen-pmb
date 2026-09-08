import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables')
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Create client to verify caller (using their token)
    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser()
    
    if (userError || !user) {
       return new Response(JSON.stringify({ error: 'Unauthorized' }), {
         status: 401,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       })
    }

    // 2. Query profiles to verify Dosen
    const { data: profile, error: profileError } = await supabaseUserClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'dosen') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Process Request
    const body = await req.json()
    const { action, ...payload } = body
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    if (action === 'create') {
      const { username, nama, nim, password } = payload
      
      if (!username || !nama || !nim || !password || password.length < 6) {
        return new Response(JSON.stringify({ error: 'Invalid input or password too short (min 6 chars)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check unique constraints: username and nim
      const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '')
      
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id, username, nim')
        .or(`username.eq.${cleanUsername},nim.eq.${nim}`)
        .limit(1)

      if (existingUser && existingUser.length > 0) {
        return new Response(JSON.stringify({ error: 'Username atau NIM sudah digunakan' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const email = `${cleanUsername}@panitia.pmb.local`

      // Create Auth User
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { username: cleanUsername, role: 'panitia' }
      })

      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: authError?.message || 'Failed to create auth user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Create Profile
      const { error: profileInsertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: nama,
          username: cleanUsername,
          nim: nim,
          role: 'panitia'
        })

      if (profileInsertError) {
        // Rollback Auth User
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return new Response(JSON.stringify({ error: profileInsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, message: 'Panitia created', data: authData.user }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else if (action === 'reset_password') {
       const { user_id, password } = payload
       
       if (!user_id || !password || password.length < 6) {
         return new Response(JSON.stringify({ error: 'Invalid input or password too short (min 6 chars)' }), {
           status: 400,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       // Verify target is panitia
       const { data: targetProfile, error: targetError } = await supabaseAdmin
         .from('profiles')
         .select('role')
         .eq('id', user_id)
         .single()

       if (targetError || targetProfile?.role !== 'panitia') {
         return new Response(JSON.stringify({ error: 'Invalid target or not a panitia' }), {
           status: 400,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
         user_id,
         { password: password }
       )

       if (updateError) {
         return new Response(JSON.stringify({ error: updateError.message }), {
           status: 500,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       return new Response(JSON.stringify({ success: true, message: 'Password reset successful' }), {
         status: 200,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       })

    } else if (action === 'set_active') {
       const { user_id, is_active } = payload
       
       if (!user_id || typeof is_active !== 'boolean') {
         return new Response(JSON.stringify({ error: 'Invalid input' }), {
           status: 400,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       // Verify target is panitia
       const { data: targetProfile, error: targetError } = await supabaseAdmin
         .from('profiles')
         .select('role')
         .eq('id', user_id)
         .single()

       if (targetError || targetProfile?.role !== 'panitia') {
         return new Response(JSON.stringify({ error: 'Invalid target or not a panitia' }), {
           status: 400,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       const { error: updateError } = await supabaseAdmin
         .from('profiles')
         .update({ is_active })
         .eq('id', user_id)

       if (updateError) {
         return new Response(JSON.stringify({ error: updateError.message }), {
           status: 500,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         })
       }

       return new Response(JSON.stringify({ success: true, message: `Panitia ${is_active ? 'diaktifkan' : 'dinonaktifkan'}` }), {
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

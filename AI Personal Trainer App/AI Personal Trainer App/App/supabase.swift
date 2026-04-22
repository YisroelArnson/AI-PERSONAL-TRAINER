//
//  supabase.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//

// Defines app-level UI and bootstrapping for supabase.
//
// This file is primarily composed of types, constants, or configuration rather than standalone functions.

import Foundation
import Supabase

let supabase = SupabaseClient(
  supabaseURL: URL(string: "https://pemfkuhbiwtnjsarwroz.supabase.co")!,
  supabaseKey: "sb_publishable_TaQspQEYJi8THzlKHPcdDA_2TakUUe-"
)


//
//  AddPreferenceSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct AddPreferenceSheet: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                VStack {
                    Text("Add/Parse Preference")
                        .font(.title2)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text("Voice or text input")
                        .font(.body)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.top, 4)
                    Spacer()
                }
                .padding(.top, 40)
            }
            .navigationTitle("AI Assist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    AddPreferenceSheet()
}


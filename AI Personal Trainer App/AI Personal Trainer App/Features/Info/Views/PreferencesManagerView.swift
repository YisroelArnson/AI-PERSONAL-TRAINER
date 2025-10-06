//
//  PreferencesManagerView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct PreferencesManagerView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                VStack {
                    Text("Preferences Manager")
                        .font(.title2)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Text("Bulk edit, reorder, search")
                        .font(.body)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.top, 4)
                    Spacer()
                }
                .padding(.top, 40)
            }
            .navigationTitle("Edit Preferences")
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
    PreferencesManagerView()
}


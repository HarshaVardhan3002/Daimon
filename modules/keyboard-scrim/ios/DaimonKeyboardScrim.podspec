Pod::Spec.new do |s|
  s.name           = 'DaimonKeyboardScrim'
  s.version        = '1.0.0'
  s.summary        = 'Keyboard tint for the Daimon reasoning dial'
  s.description    = 'Shades only the iOS keyboard while the reasoning dial is open, like the Android KeyboardScrim window.'
  s.author         = 'Daimon'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end

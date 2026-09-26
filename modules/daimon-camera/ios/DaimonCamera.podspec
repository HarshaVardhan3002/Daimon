Pod::Spec.new do |s|
  s.name           = 'DaimonCamera'
  s.version        = '1.0.0'
  s.summary        = 'Native camera touches for the Daimon in-app camera'
  s.description    = 'Sets the focus and exposure point of the active capture device used by expo-camera.'
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

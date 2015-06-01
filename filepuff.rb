require 'filesize'
size = Filesize.from(ARGV[1]).to_i
File.open(ARGV[0], 'wb') { |file| 
  file.write [size].pack("L")
  (5..size).each { |char| file.write [0].pack("C") } 
}

Get-ChildItem -Recurse -File | Where-Object {
    $_.Extension -match '\.(png|webp|bmp|tiff|gif|jpeg|jpg)$'
} | ForEach-Object {

    $input = $_.FullName
    $output = [System.IO.Path]::ChangeExtension($input, ".jpg")

    # Skip if JPG already exists
    if (Test-Path $output) {
        Write-Host "Skipping existing: $output"
        return
    }

    Write-Host "Converting: $input"

    magick "$input" `
        -resize "1920x1080>" `
        -quality 85 `
        -strip `
        "$output"
}